use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{LazyLock, Mutex, OnceLock};

use objc2::rc::{autoreleasepool, Allocated, Retained};
use objc2::{extern_class, extern_methods, msg_send, AnyThread};
use objc2_foundation::{
    ns_string, NSDictionary, NSError, NSMutableDictionary, NSNumber, NSObject, NSString, NSURL,
};
use serde::Deserialize;
use tauri::Emitter;

#[link(name = "CoreML", kind = "framework")]
unsafe extern "C" {}

const HUBBLE_URL: &str =
    "https://www.usecelestial.xyz/hubble.zip";
const HUBBLE_DIR: &str = "hubble";
const HUBBLE_ZIP: &str = "hubble.zip";
const MODEL_FILE: &str = "hubble.mlmodel";
const COMPILED_MODEL: &str = "hubble.mlmodelc";
const FEATURE_NAMES: &str = "hubble_feature_names.json";
const FEATURE_SPEC: &str = "hubble_feature_spec.json";

// do not change these i tested u havent
const MIN_SCORE: f64 = 0.59;
const DESCRIPTION_WEIGHT: f64 = 0.32;

static STOPWORDS: &[&str] = &[
    "a",
    "an",
    "and",
    "any",
    "best",
    "for",
    "free",
    "game",
    "games",
    "good",
    "hub",
    "i",
    "in",
    "key",
    "keyless",
    "lua",
    "luau",
    "me",
    "new",
    "no",
    "of",
    "on",
    "or",
    "please",
    "roblox",
    "script",
    "scripts",
    "still",
    "that",
    "the",
    "to",
    "universal",
    "want",
    "with",
    "works",
];

static STOPWORD_SET: LazyLock<HashSet<&'static str>> =
    LazyLock::new(|| STOPWORDS.iter().copied().collect());
static HUBBLE_CONFIG: OnceLock<HubbleConfig> = OnceLock::new();
static HUBBLE_INSTALL_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

thread_local! {
    static MODEL_CACHE: std::cell::RefCell<Option<Retained<MLModel>>> = const { std::cell::RefCell::new(None) };
}

#[derive(Deserialize)]
struct FeatureSpec {
    query_word_ngrams: Vec<usize>,
    title_word_ngrams: Vec<usize>,
    description_word_ngrams: Vec<usize>,
    game_word_ngrams: Vec<usize>,
    query_title_word_ngrams: Vec<usize>,
    title_game_word_ngrams: Vec<usize>,
    title_char_ngram_range: [usize; 2],
    query_title_char_ngram_range: [usize; 2],
}

struct HubbleConfig {
    feature_names: HashSet<String>,
    feature_spec: FeatureSpec,
}

impl HubbleConfig {
    fn load() -> Result<Self, String> {
        let feature_names = fs::read_to_string(hubble_feature_names_path()?)
            .map_err(|error| format!("read hubble feature names: {error}"))?;
        let feature_names = serde_json::from_str::<Vec<String>>(&feature_names)
            .map_err(|error| format!("parse hubble feature names: {error}"))?;
        let feature_spec = fs::read_to_string(hubble_feature_spec_path()?)
            .map_err(|error| format!("read hubble feature spec: {error}"))?;
        let feature_spec = serde_json::from_str::<FeatureSpec>(&feature_spec)
            .map_err(|error| format!("parse hubble feature spec: {error}"))?;

        Ok(Self {
            feature_names: feature_names.into_iter().collect(),
            feature_spec,
        })
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubbleCandidate {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub game_name: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubbleDecision {
    pub id: String,
    pub score: f64,
    pub accepted: bool,
}

struct PreparedText {
    normalized: String,
    tokens: Vec<String>,
}

extern_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = AnyThread]
    #[derive(Debug, PartialEq, Eq, Hash)]
    struct MLModel;
);

impl MLModel {
    extern_methods!(
        #[unsafe(method(modelWithContentsOfURL:error:_))]
        pub fn model_with_contents_of_url(url: &NSURL)
            -> Result<Retained<Self>, Retained<NSError>>;

        #[unsafe(method(compileModelAtURL:error:_))]
        pub fn compile_model_at_url(
            model_url: &NSURL,
        ) -> Result<Retained<NSURL>, Retained<NSError>>;

        #[unsafe(method(predictionFromFeatures:error:_))]
        pub fn prediction_from_features(
            &self,
            input: &MLDictionaryFeatureProvider,
        ) -> Result<Retained<NSObject>, Retained<NSError>>;
    );
}

extern_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = AnyThread]
    #[derive(Debug, PartialEq, Eq, Hash)]
    struct MLFeatureValue;
);

impl MLFeatureValue {
    extern_methods!(
        #[unsafe(method(featureValueWithDictionary:error:_))]
        pub fn feature_value_with_dictionary(
            value: &NSDictionary<NSString, NSNumber>,
        ) -> Result<Retained<Self>, Retained<NSError>>;

        #[unsafe(method(dictionaryValue))]
        pub fn dictionary_value(&self) -> Retained<NSDictionary<NSNumber, NSNumber>>;

        #[unsafe(method(int64Value))]
        pub fn int64_value(&self) -> i64;
    );
}

extern_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = AnyThread]
    #[derive(Debug, PartialEq, Eq, Hash)]
    struct MLDictionaryFeatureProvider;
);

impl MLDictionaryFeatureProvider {
    extern_methods!(
        #[unsafe(method(initWithDictionary:error:_))]
        pub fn init_with_dictionary(
            this: Allocated<Self>,
            dictionary: &NSDictionary<NSString, MLFeatureValue>,
        ) -> Result<Retained<Self>, Retained<NSError>>;
    );
}

fn hubble_config() -> Result<&'static HubbleConfig, String> {
    if let Some(config) = HUBBLE_CONFIG.get() {
        return Ok(config);
    }

    let config = HubbleConfig::load()?;
    let _ = HUBBLE_CONFIG.set(config);
    HUBBLE_CONFIG
        .get()
        .ok_or_else(|| "cache hubble config".to_string())
}

fn ns_error_to_string(error: Retained<NSError>) -> String {
    error.to_string()
}

fn hubble_dir() -> Result<PathBuf, String> {
    Ok(super::get_app_data_dir()?.join(HUBBLE_DIR))
}

fn hubble_compiled_model_path() -> Result<PathBuf, String> {
    Ok(hubble_dir()?.join(COMPILED_MODEL))
}

fn hubble_feature_names_path() -> Result<PathBuf, String> {
    Ok(hubble_dir()?.join(FEATURE_NAMES))
}

fn hubble_feature_spec_path() -> Result<PathBuf, String> {
    Ok(hubble_dir()?.join(FEATURE_SPEC))
}

fn has_hubble_files(dir: &Path) -> bool {
    dir.join(COMPILED_MODEL).is_dir()
        && dir.join(FEATURE_NAMES).is_file()
        && dir.join(FEATURE_SPEC).is_file()
}

fn remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| format!("remove {}: {error}", path.display()))
    } else {
        fs::remove_file(path).map_err(|error| format!("remove {}: {error}", path.display()))
    }
}

fn clear_hubble_files(dir: &Path) {
    let _ = remove_path(&dir.join(HUBBLE_ZIP));
    let _ = remove_path(&dir.join(MODEL_FILE));
    let _ = remove_path(&dir.join(COMPILED_MODEL));
    let _ = remove_path(&dir.join(FEATURE_NAMES));
    let _ = remove_path(&dir.join(FEATURE_SPEC));
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("create {}: {error}", destination.display()))?;

    for entry in
        fs::read_dir(source).map_err(|error| format!("read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("read {}: {error}", source.display()))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| format!("inspect {}: {error}", source_path.display()))?;

        if file_type.is_dir() {
            copy_dir(&source_path, &destination_path)?;
            continue;
        }

        fs::copy(&source_path, &destination_path).map_err(|error| {
            format!(
                "copy {} to {}: {error}",
                source_path.display(),
                destination_path.display()
            )
        })?;
    }

    Ok(())
}

fn unpack_hubble(archive_path: &Path, target_dir: &Path) -> Result<(), String> {
    let status = Command::new("/usr/bin/ditto")
        .arg("-x")
        .arg("-k")
        .arg(archive_path)
        .arg(target_dir)
        .status()
        .map_err(|error| format!("launch ditto: {error}"))?;

    if !status.success() {
        return Err("unpack hubble".to_string());
    }

    let mut source_dir = target_dir.to_path_buf();
    let required_names = [MODEL_FILE, FEATURE_NAMES, FEATURE_SPEC];

    if required_names
        .iter()
        .any(|name| !target_dir.join(name).exists())
    {
        let model_dir = target_dir.join("model");
        if required_names.iter().all(|name| model_dir.join(name).exists()) {
            for name in required_names {
                fs::rename(model_dir.join(name), target_dir.join(name))
                    .map_err(|error| format!("move {name}: {error}"))?;
            }
            remove_path(&model_dir)?;
            source_dir = target_dir.to_path_buf();
        }
    }

    for required_path in required_names.map(|name| source_dir.join(name)) {
        if !required_path.exists() {
            return Err(format!("missing {}", required_path.display()));
        }
    }

    Ok(())
}

fn compile_model(source_model_path: &Path, compiled_model_path: &Path) -> Result<(), String> {
    let model_url =
        NSURL::from_file_path(source_model_path).ok_or_else(|| "build model url".to_string())?;
    let compiled_url = MLModel::compile_model_at_url(&model_url)
        .map_err(|error| format!("compile model: {}", ns_error_to_string(error)))?;
    let compiled_source_path = compiled_url
        .to_file_path()
        .ok_or_else(|| "find compiled model".to_string())?;

    remove_path(compiled_model_path)?;
    copy_dir(&compiled_source_path, compiled_model_path)
}

fn combined_overlap(
    query_tokens: &[String],
    title_tokens: &[String],
    description_tokens: &[String],
    game_tokens: &[String],
) -> f64 {
    let mut title_game_tokens = title_tokens.to_vec();
    title_game_tokens.extend(game_tokens.iter().cloned());

    (overlap_ratio(query_tokens, &title_game_tokens) * (1.0 - DESCRIPTION_WEIGHT))
        + (overlap_ratio(query_tokens, description_tokens) * DESCRIPTION_WEIGHT)
}

fn install_hubble_from_archive(dir: PathBuf, archive_bytes: Vec<u8>) -> Result<(), String> {
    let had_ready = has_hubble_files(&dir);

    let result = (|| {
        fs::create_dir_all(&dir).map_err(|error| format!("create {}: {error}", dir.display()))?;

        let archive_path = dir.join(HUBBLE_ZIP);
        fs::write(&archive_path, archive_bytes)
            .map_err(|error| format!("write {}: {error}", archive_path.display()))?;

        unpack_hubble(&archive_path, &dir)?;
        compile_model(&dir.join(MODEL_FILE), &dir.join(COMPILED_MODEL))?;

        remove_path(&dir.join(HUBBLE_ZIP))?;
        remove_path(&dir.join(MODEL_FILE))?;

        Ok(())
    })();

    if result.is_err() && !had_ready {
        clear_hubble_files(&dir);
    }

    result
}

fn get_model() -> Result<Retained<MLModel>, String> {
    MODEL_CACHE.with(|cache| {
        if let Some(model) = cache.borrow().as_ref() {
            return Ok(model.clone());
        }

        let compiled_model_path = hubble_compiled_model_path()?;
        let compiled_url = NSURL::from_file_path(&compiled_model_path)
            .ok_or_else(|| "open compiled hubble".to_string())?;
        let model = MLModel::model_with_contents_of_url(&compiled_url)
            .map_err(|error| format!("open model: {}", ns_error_to_string(error)))?;
        *cache.borrow_mut() = Some(model.clone());
        Ok(model)
    })
}

fn normalize_text(text: &str) -> String {
    let mut normalized = String::with_capacity(text.len());
    let mut previous_was_space = true;

    for ch in text.chars().flat_map(char::to_lowercase) {
        let mapped = if ch.is_ascii_alphanumeric() { ch } else { ' ' };
        if mapped == ' ' {
            if !previous_was_space {
                normalized.push(' ');
                previous_was_space = true;
            }
        } else {
            normalized.push(mapped);
            previous_was_space = false;
        }
    }

    if normalized.ends_with(' ') {
        normalized.pop();
    }

    normalized
}

fn preprocess_text(text: &str) -> PreparedText {
    let normalized = normalize_text(text);
    let tokens = normalized
        .split(' ')
        .filter(|token| !token.is_empty())
        .filter(|token| !STOPWORD_SET.contains(*token))
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    PreparedText { normalized, tokens }
}

fn add_feature(
    features: &mut HashMap<String, f64>,
    feature_names: &HashSet<String>,
    key: String,
    value: f64,
) {
    if !feature_names.contains(&key) {
        return;
    }

    *features.entry(key).or_insert(0.0) += value;
}

fn add_word_ngrams(
    features: &mut HashMap<String, f64>,
    feature_names: &HashSet<String>,
    prefix: &str,
    tokens: &[String],
    sizes: &[usize],
    weight: f64,
) {
    if tokens.is_empty() {
        return;
    }

    for &ngram_size in sizes {
        if tokens.len() < ngram_size {
            continue;
        }

        for window in tokens.windows(ngram_size) {
            let joined = window.join("_");
            add_feature(
                features,
                feature_names,
                format!("{prefix}={joined}"),
                weight,
            );
        }
    }
}

fn add_char_ngrams(
    features: &mut HashMap<String, f64>,
    feature_names: &HashSet<String>,
    prefix: &str,
    text: &str,
    range: [usize; 2],
) {
    if text.is_empty() {
        return;
    }

    let chars = text.chars().collect::<Vec<_>>();

    for ngram_size in range[0]..=range[1] {
        if chars.len() < ngram_size {
            continue;
        }

        for start in 0..=(chars.len() - ngram_size) {
            let gram = chars[start..start + ngram_size]
                .iter()
                .map(|ch| if *ch == ' ' { '_' } else { *ch })
                .collect::<String>();
            add_feature(features, feature_names, format!("{prefix}={gram}"), 1.0);
        }
    }
}

fn overlap_ratio(query_tokens: &[String], other_tokens: &[String]) -> f64 {
    if query_tokens.is_empty() || other_tokens.is_empty() {
        return 0.0;
    }

    let query_set = query_tokens.iter().collect::<HashSet<_>>();
    let other_set = other_tokens.iter().collect::<HashSet<_>>();
    let overlap = query_set.intersection(&other_set).count();
    overlap as f64 / query_set.len() as f64
}

fn add_meta_feature(
    features: &mut HashMap<String, f64>,
    feature_names: &HashSet<String>,
    name: &str,
    value: f64,
) {
    if !feature_names.contains(name) {
        return;
    }

    features.insert(name.to_string(), value);
}

fn build_features(
    query_text: &str,
    candidate: &HubbleCandidate,
    config: &HubbleConfig,
) -> HashMap<String, f64> {
    let query = preprocess_text(query_text);
    let title = preprocess_text(&candidate.title);
    let description = preprocess_text(candidate.description.as_deref().unwrap_or(""));
    let game = preprocess_text(candidate.game_name.as_deref().unwrap_or(""));
    let query_title = preprocess_text(&format!("query {query_text} title {}", candidate.title));
    let title_game = preprocess_text(&format!(
        "title {} game {}",
        candidate.title,
        candidate.game_name.as_deref().unwrap_or("")
    ));

    let mut features = HashMap::new();
    let feature_names = &config.feature_names;
    let feature_spec = &config.feature_spec;

    add_word_ngrams(
        &mut features,
        feature_names,
        "qw",
        &query.tokens,
        &feature_spec.query_word_ngrams,
        1.0,
    );
    add_word_ngrams(
        &mut features,
        feature_names,
        "tw",
        &title.tokens,
        &feature_spec.title_word_ngrams,
        1.0,
    );
    add_word_ngrams(
        &mut features,
        feature_names,
        "dw",
        &description.tokens,
        &feature_spec.description_word_ngrams,
        DESCRIPTION_WEIGHT,
    );
    add_word_ngrams(
        &mut features,
        feature_names,
        "gw",
        &game.tokens,
        &feature_spec.game_word_ngrams,
        1.0,
    );
    add_word_ngrams(
        &mut features,
        feature_names,
        "qtw",
        &query_title.tokens,
        &feature_spec.query_title_word_ngrams,
        1.0,
    );
    add_word_ngrams(
        &mut features,
        feature_names,
        "tgw",
        &title_game.tokens,
        &feature_spec.title_game_word_ngrams,
        1.0,
    );
    add_char_ngrams(
        &mut features,
        feature_names,
        "tc",
        &title.normalized,
        feature_spec.title_char_ngram_range,
    );
    add_char_ngrams(
        &mut features,
        feature_names,
        "qtc",
        &query_title.normalized,
        feature_spec.query_title_char_ngram_range,
    );

    let exact_title_match = !query.normalized.is_empty() && query.normalized == title.normalized;
    let exact_game_match = !query.normalized.is_empty() && query.normalized == game.normalized;
    let query_in_title =
        !query.normalized.is_empty() && title.normalized.contains(&query.normalized);
    let title_in_query =
        !title.normalized.is_empty() && query.normalized.contains(&title.normalized);
    let query_in_game = !query.normalized.is_empty() && game.normalized.contains(&query.normalized);
    let title_startswith_query =
        !query.normalized.is_empty() && title.normalized.starts_with(&query.normalized);
    let title_token_overlap = overlap_ratio(&query.tokens, &title.tokens);
    let game_token_overlap = overlap_ratio(&query.tokens, &game.tokens);
    let combined_token_overlap = combined_overlap(
        &query.tokens,
        &title.tokens,
        &description.tokens,
        &game.tokens,
    );

    add_meta_feature(
        &mut features,
        feature_names,
        "meta:exact_title_match",
        if exact_title_match { 1.0 } else { 0.0 },
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:exact_game_match",
        if exact_game_match { 1.0 } else { 0.0 },
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:query_in_title",
        if query_in_title { 1.0 } else { 0.0 },
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:title_in_query",
        if title_in_query { 1.0 } else { 0.0 },
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:query_in_game",
        if query_in_game { 1.0 } else { 0.0 },
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:title_startswith_query",
        if title_startswith_query { 1.0 } else { 0.0 },
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:title_token_overlap",
        title_token_overlap,
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:game_token_overlap",
        game_token_overlap,
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:combined_token_overlap",
        combined_token_overlap,
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:title_length",
        (title.tokens.len().min(20) as f64) / 20.0,
    );
    add_meta_feature(
        &mut features,
        feature_names,
        "meta:game_length",
        (game.tokens.len().min(10) as f64) / 10.0,
    );

    features
}

fn score_match(model: &MLModel, feature_map: &HashMap<String, f64>) -> Result<(f64, bool), String> {
    autoreleasepool(|_| {
        let native_feature_map = NSMutableDictionary::<NSString, NSNumber>::new();
        for (key, value) in feature_map {
            let key = NSString::from_str(key);
            let value = NSNumber::new_f64(*value);
            native_feature_map.insert(&*key, &value);
        }

        let feature_value = MLFeatureValue::feature_value_with_dictionary(&native_feature_map)
            .map_err(|error| format!("make feature value: {}", ns_error_to_string(error)))?;
        let provider_inputs = NSMutableDictionary::<NSString, MLFeatureValue>::new();
        provider_inputs.insert(ns_string!("features"), &feature_value);
        let provider = MLDictionaryFeatureProvider::init_with_dictionary(
            MLDictionaryFeatureProvider::alloc(),
            &provider_inputs,
        )
        .map_err(|error| format!("make feature provider: {}", ns_error_to_string(error)))?;

        let prediction = model
            .prediction_from_features(&provider)
            .map_err(|error| format!("run model: {}", ns_error_to_string(error)))?;
        let class_probability: Option<Retained<MLFeatureValue>> =
            unsafe { msg_send![&*prediction, featureValueForName: ns_string!("classProbability")] };
        let class_probability =
            class_probability.ok_or_else(|| "missing classProbability".to_string())?;
        let probabilities = class_probability.dictionary_value();
        let relevant_key = NSNumber::new_i64(1);
        let score = probabilities
            .objectForKey(&relevant_key)
            .map(|value| value.as_f64())
            .ok_or_else(|| "missing relevance score".to_string())?;
        Ok((score, score >= MIN_SCORE))
    })
}

pub fn score_candidates(
    query: String,
    candidates: Vec<HubbleCandidate>,
) -> Result<Vec<HubbleDecision>, String> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let config = hubble_config()?;
    let model = get_model()?;
    let decisions = candidates
        .iter()
        .map(|candidate| {
            let feature_map = build_features(&query, candidate, config);
            let (score, accepted) = score_match(&model, &feature_map)?;
            Ok(HubbleDecision {
                id: candidate.id.clone(),
                score,
                accepted,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(decisions)
}

#[tauri::command]
pub fn is_hubble_ready() -> bool {
    hubble_dir()
        .map(|dir| has_hubble_files(&dir))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn ensure_hubble_ready(app: tauri::AppHandle) -> Result<(), String> {
    let hubble_dir = hubble_dir()?;
    if has_hubble_files(&hubble_dir) {
        return Ok(());
    }

    fs::create_dir_all(&hubble_dir)
        .map_err(|error| format!("create {}: {error}", hubble_dir.display()))?;

    let _ = app.emit("hubble-status", "downloading");

    let client = super::build_http_client()?;
    let archive_bytes = client
        .get(HUBBLE_URL)
        .send()
        .await
        .map_err(|error| format!("download hubble: {error}"))?
        .error_for_status()
        .map_err(|error| format!("download hubble: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("read hubble archive: {error}"))?
        .to_vec();

    let _ = app.emit("hubble-status", "compiling");

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = HUBBLE_INSTALL_LOCK
            .lock()
            .map_err(|_| "lock hubble install".to_string())?;
        if has_hubble_files(&hubble_dir) {
            return Ok(());
        }

        install_hubble_from_archive(hubble_dir, archive_bytes)
    })
    .await
    .map_err(|error| format!("join hubble install: {error}"))?
}

#[tauri::command]
pub async fn filter_hubble_candidates(
    query: String,
    candidates: Vec<HubbleCandidate>,
) -> Result<Vec<HubbleDecision>, String> {
    tauri::async_runtime::spawn_blocking(move || score_candidates(query, candidates))
        .await
        .map_err(|error| format!("join hubble filter: {error}"))?
}


export function cleanScriptName(title: string, gameName: string | null = null): string {
  let name = title;
  
  name = name.replace(/[\[\(\{].*?[\]\)\}]/g, '');
  
  name = name.replace(/[\p{Emoji}\p{Emoji_Component}]/gu, '');
  
  name = name.replace(/v?\d+\.?\d+/g, '');
  
  name = name.split(/[-|—]/)[0];
  
  const goyslop = [
    'roblox', 'script', 'new', 'hack', 'working', 
    'no key', 'keyless', 'no keys', 'no adlinks',
    'full', 'release', 'exclusive', 'insta', 'and more',
    'op', 'best', 'mega', 'ultimate', 'crazy'
  ];
  
  const pattern = new RegExp(`\\b(${goyslop.join('|')})\\b`, 'gi');
  name = name.replace(pattern, '');
  
  name = name.replace(/[^a-zA-Z0-9\s]/g, ' ');
  
  name = name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  
  if ((!name || name.length < 3) && gameName) {
    name = gameName
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  if (!name || name.length < 3) {
    name = 'Script';
  }
  
  return name + '.lua';
}

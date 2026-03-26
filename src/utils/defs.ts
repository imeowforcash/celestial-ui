import { exists, readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
export interface CompletionItem {
  caption: string;
  value: string;
  meta: string;
  score?: number;
  snippet?: string;
  docText?: string;
}
export const definitions: CompletionItem[] = [
  {
    caption: "readfile",
    value: "readfile()",
    meta: "FileSystem",
    snippet: "readfile(\"${1:path}\")",
    docText: "Reads the contents of the file at the specified path."
  },
  {
    caption: "writefile",
    value: "writefile()",
    meta: "FileSystem",
    snippet: "writefile(\"${1:path}\", \"${2:data}\")",
    docText: "Writes data to a file at the specified path. Overwrites existing content."
  },
  {
    caption: "appendfile",
    value: "appendfile()",
    meta: "FileSystem",
    snippet: "appendfile(\"${1:path}\", \"${2:content}\")",
    docText: "Appends string content to the end of a file at the specified path."
  },
  {
    caption: "delfile",
    value: "delfile()",
    meta: "FileSystem",
    snippet: "delfile(\"${1:path}\")",
    docText: "Deletes the file at the specified path if it exists."
  },
  {
    caption: "listfiles",
    value: "listfiles()",
    meta: "FileSystem",
    snippet: "listfiles(\"${1:folder}\")",
    docText: "Returns a list of files in the specified folder."
  },
  {
    caption: "makefolder",
    value: "makefolder()",
    meta: "FileSystem",
    snippet: "makefolder(\"${1:path}\")",
    docText: "Creates a new folder at the specified path."
  },
  {
    caption: "delfolder",
    value: "delfolder()",
    meta: "FileSystem",
    snippet: "delfolder(\"${1:path}\")",
    docText: "Deletes the folder at the specified path if it exists."
  },
  {
    caption: "isfile",
    value: "isfile()",
    meta: "FileSystem",
    snippet: "isfile(\"${1:path}\")",
    docText: "Returns true if the path points to an existing file."
  },
  {
    caption: "isfolder",
    value: "isfolder()",
    meta: "FileSystem",
    snippet: "isfolder(\"${1:path}\")",
    docText: "Returns true if the path points to an existing folder."
  },
  {
    caption: "loadfile",
    value: "loadfile()",
    meta: "FileSystem",
    snippet: "loadfile(\"${1:path}\")",
    docText: "Loads a file as a Lua chunk and returns it as a function."
  },
  {
    caption: "getgenv",
    value: "getgenv()",
    meta: "Environment",
    snippet: "getgenv()",
    docText: "Returns the global environment table."
  },
  {
    caption: "getrenv",
    value: "getrenv()",
    meta: "Environment",
    snippet: "getrenv()",
    docText: "Returns the Roblox global environment table."
  },
  {
    caption: "getgc",
    value: "getgc()",
    meta: "Environment",
    snippet: "getgc(${1:includeTables})",
    docText: "Returns a list of non-dead garbage-collectable values (functions, userdata, tables)."
  },
  {
    caption: "filtergc",
    value: "filtergc()",
    meta: "Environment",
    snippet: "filtergc(\"${1:type}\", { ${2:options} }, ${3:returnOne})",
    docText: "Filters garbage-collected values based on type and options (Keys, Values, Metatable, etc.)."
  },
  {
    caption: "getloadedmodules",
    value: "getloadedmodules()",
    meta: "Environment",
    snippet: "getloadedmodules()",
    docText: "Returns a list of all loaded ModuleScripts."
  },
  {
    caption: "getconnections",
    value: "getconnections()",
    meta: "Environment",
    snippet: "getconnections(${1:signal})",
    docText: "Returns a list of connections for the specified signal."
  },
  {
    caption: "checkcaller",
    value: "checkcaller()",
    meta: "Environment",
    snippet: "checkcaller()",
    docText: "Returns true if the current function was invoked from the executor's thread."
  },
  {
    caption: "getscripts",
    value: "getscripts()",
    meta: "Environment",
    snippet: "getscripts()",
    docText: "Returns all script instances in the game."
  },
  {
    caption: "getrunningscripts",
    value: "getrunningscripts()",
    meta: "Environment",
    snippet: "getrunningscripts()",
    docText: "Returns all currently running scripts."
  },
  {
    caption: "isreadonly",
    value: "isreadonly()",
    meta: "Environment",
    snippet: "isreadonly(${1:table})",
    docText: "Returns true if the table is read-only."
  },
  {
    caption: "setreadonly",
    value: "setreadonly()",
    meta: "Environment",
    snippet: "setreadonly(${1:table}, ${2:readonly})",
    docText: "Sets whether a table is read-only."
  },
  {
    caption: "fireclickdetector",
    value: "fireclickdetector()",
    meta: "Interaction",
    snippet: "fireclickdetector(${1:detector}, ${2:distance}, \"${3:event}\")",
    docText: "Triggers a ClickDetector event (e.g., MouseClick)."
  },
  {
    caption: "fireproximityprompt",
    value: "fireproximityprompt()",
    meta: "Interaction",
    snippet: "fireproximityprompt(${1:prompt})",
    docText: "Instantly triggers a ProximityPrompt, bypassing hold duration."
  },
  {
    caption: "firetouchinterest",
    value: "firetouchinterest()",
    meta: "Interaction",
    snippet: "firetouchinterest(${1:part1}, ${2:part2}, ${3:toggle})",
    docText: "Simulates a touch event between two BaseParts. Toggle 0/1 for Start/End."
  },
  {
    caption: "firesignal",
    value: "firesignal()",
    meta: "Interaction",
    snippet: "firesignal(${1:signal}, ${2:...args})",
    docText: "Invokes all connections of a signal immediately."
  },
  {
    caption: "cloneref",
    value: "cloneref()",
    meta: "Interaction",
    snippet: "cloneref(${1:instance})",
    docText: "Returns a safe reference clone of an Instance to avoid detection."
  },
  {
    caption: "compareinstances",
    value: "compareinstances()",
    meta: "Interaction",
    snippet: "compareinstances(${1:obj1}, ${2:obj2})",
    docText: "Checks if two instances are equal (useful for cloneref'd instances)."
  },
  {
    caption: "gethui",
    value: "gethui()",
    meta: "Interaction",
    snippet: "gethui()",
    docText: "Returns the hidden CoreGui container (safe alternative to game.CoreGui)."
  },
  {
    caption: "gethiddenproperty",
    value: "gethiddenproperty()",
    meta: "Interaction",
    snippet: "gethiddenproperty(${1:instance}, \"${2:property}\")",
    docText: "Gets a hidden/locked property from an instance."
  },
  {
    caption: "sethiddenproperty",
    value: "sethiddenproperty()",
    meta: "Interaction",
    snippet: "sethiddenproperty(${1:instance}, \"${2:property}\", ${3:value})",
    docText: "Sets a hidden/locked property on an instance."
  },
  {
    caption: "hookfunction",
    value: "hookfunction()",
    meta: "Hooking",
    snippet: "hookfunction(${1:target}, ${2:hook})",
    docText: "Hooks a function, replacing it with a new one. Returns the original function."
  },
  {
    caption: "hookmetamethod",
    value: "hookmetamethod()",
    meta: "Hooking",
    snippet: "hookmetamethod(${1:object}, \"${2:method}\", ${3:hook})",
    docText: "Hooks a metamethod of an object (e.g., __namecall, __index)."
  },
  {
    caption: "newcclosure",
    value: "newcclosure()",
    meta: "Hooking",
    snippet: "newcclosure(${1:func})",
    docText: "Wraps a Luau function into a C closure to prevent decompilation."
  },
  {
    caption: "clonefunction",
    value: "clonefunction()",
    meta: "Hooking",
    snippet: "clonefunction(${1:func})",
    docText: "Creates a copy of a function with the same environment."
  },
  {
    caption: "restorefunction",
    value: "restorefunction()",
    meta: "Hooking",
    snippet: "restorefunction(${1:func})",
    docText: "Restores a hooked function to its original state."
  },
  {
    caption: "iscclosure",
    value: "iscclosure()",
    meta: "Hooking",
    snippet: "iscclosure(${1:func})",
    docText: "Returns true if the function is a C closure."
  },
  {
    caption: "islclosure",
    value: "islclosure()",
    meta: "Hooking",
    snippet: "islclosure(${1:func})",
    docText: "Returns true if the function is a Luau closure."
  },
  {
    caption: "getnamecallmethod",
    value: "getnamecallmethod()",
    meta: "Hooking",
    snippet: "getnamecallmethod()",
    docText: "Returns the method name being called via namecall (__namecall)."
  },
  {
    caption: "debug.getconstants",
    value: "debug.getconstants()",
    meta: "Debug",
    snippet: "debug.getconstants(${1:func})",
    docText: "Returns the constants table of a Lua function."
  },
  {
    caption: "debug.getconstant",
    value: "debug.getconstant()",
    meta: "Debug",
    snippet: "debug.getconstant(${1:func}, ${2:index})",
    docText: "Returns a specific constant from a function at the given index."
  },
  {
    caption: "debug.getupvalues",
    value: "debug.getupvalues()",
    meta: "Debug",
    snippet: "debug.getupvalues(${1:func})",
    docText: "Returns the upvalues table of a Lua function."
  },
  {
    caption: "debug.getupvalue",
    value: "debug.getupvalue()",
    meta: "Debug",
    snippet: "debug.getupvalue(${1:func}, ${2:index})",
    docText: "Returns a specific upvalue from a function at the given index."
  },
  {
    caption: "debug.getprotos",
    value: "debug.getprotos()",
    meta: "Debug",
    snippet: "debug.getprotos(${1:func})",
    docText: "Returns a list of inner function prototypes from a function."
  },
  {
    caption: "debug.getproto",
    value: "debug.getproto()",
    meta: "Debug",
    snippet: "debug.getproto(${1:func}, ${2:index})",
    docText: "Returns a specific inner function prototype at the given index."
  },
  {
    caption: "debug.getstack",
    value: "debug.getstack()",
    meta: "Debug",
    snippet: "debug.getstack(${1:level}, ${2:index})",
    docText: "Returns the stack at the specified level and index."
  },
  {
    caption: "getscriptbytecode",
    value: "getscriptbytecode()",
    meta: "Debug",
    snippet: "getscriptbytecode(${1:script})",
    docText: "Returns the bytecode of a script instance."
  },
  {
    caption: "debug.setconstant",
    value: "debug.setconstant()",
    meta: "Debug",
    snippet: "debug.setconstant(${1:func}, ${2:index}, ${3:value})",
    docText: "Sets a constant in a function at the given index."
  },
  {
    caption: "debug.setupvalue",
    value: "debug.setupvalue()",
    meta: "Debug",
    snippet: "debug.setupvalue(${1:func}, ${2:index}, ${3:value})",
    docText: "Sets an upvalue in a function at the given index."
  },
  {
    caption: "debug.setstack",
    value: "debug.setstack()",
    meta: "Debug",
    snippet: "debug.setstack(${1:level}, ${2:index}, ${3:value})",
    docText: "Sets a value on the stack at the specified level and index."
  },
  {
    caption: "Drawing.new",
    value: "Drawing.new()",
    meta: "Drawing",
    snippet: "Drawing.new(\"${1:Type}\")",
    docText: "Creates a new drawing object (Line, Text, Image, Circle, Square, Quad, Triangle)."
  },
  {
    caption: "cleardrawcache",
    value: "cleardrawcache()",
    meta: "Drawing",
    snippet: "cleardrawcache()",
    docText: "Removes all active drawing objects."
  },
  {
    caption: "getrenderproperty",
    value: "getrenderproperty()",
    meta: "Drawing",
    snippet: "getrenderproperty(${1:object}, \"${2:prop}\")",
    docText: "Returns the value of a property from a drawing object."
  },
  {
    caption: "setrenderproperty",
    value: "setrenderproperty()",
    meta: "Drawing",
    snippet: "setrenderproperty(${1:object}, \"${2:prop}\", ${3:value})",
    docText: "Sets the value of a property on a drawing object."
  },
  {
    caption: "request",
    value: "request()",
    meta: "Network",
    snippet: "request({\n    Url = \"${1:url}\",\n    Method = \"${2:GET}\",\n    Headers = {},\n    Body = \"${3:body}\"\n})",
    docText: "Sends an HTTP request."
  },
  {
    caption: "WebSocket.connect",
    value: "WebSocket.connect()",
    meta: "Network",
    snippet: "WebSocket.connect(\"${1:url}\")",
    docText: "Opens a WebSocket connection to the specified URL."
  },
  {
    caption: "setclipboard",
    value: "setclipboard()",
    meta: "Misc",
    snippet: "setclipboard(\"${1:content}\")",
    docText: "Copies the provided text to the system clipboard."
  },
  {
    caption: "setfpscap",
    value: "setfpscap()",
    meta: "Misc",
    snippet: "setfpscap(${1:fps})",
    docText: "Sets the in-game FPS cap."
  },
  {
    caption: "identifyexecutor",
    value: "identifyexecutor()",
    meta: "Misc",
    snippet: "identifyexecutor()",
    docText: "Returns the name and version of the current executor."
  },
  {
    caption: "lz4compress",
    value: "lz4compress()",
    meta: "Misc",
    snippet: "lz4compress(${1:data})",
    docText: "Compresses a string using LZ4 compression."
  },
  {
    caption: "base64encode",
    value: "base64encode()",
    meta: "Misc",
    snippet: "base64encode(\"${1:data}\")",
    docText: "Encodes a string into Base64 format."
  },
  {
    caption: "base64decode",
    value: "base64decode()",
    meta: "Misc",
    snippet: "base64decode(\"${1:data}\")",
    docText: "Decodes a Base64 encoded string."
  },
  {
    caption: "getcustomasset",
    value: "getcustomasset()",
    meta: "Misc",
    snippet: "getcustomasset(\"${1:path}\")",
    docText: "Loads a local file as a usable asset ID for Roblox instances."
  },
  {
    caption: "isexecutorclosure",
    value: "isexecutorclosure()",
    meta: "Closures",
    snippet: "isexecutorclosure(${1:func})",
    docText: "Checks whether a given function is a closure of the executor."
  },
  {
    caption: "getfunctionhash",
    value: "getfunctionhash()",
    meta: "Closures",
    snippet: "getfunctionhash(${1:func})",
    docText: "Returns the hex-represented SHA384 hash of a function's instructions and constants."
  },
  {
    caption: "lz4decompress",
    value: "lz4decompress()",
    meta: "Encoding",
    snippet: "lz4decompress(${1:data}, ${2:size})",
    docText: "Decompresses a string that was encoded using LZ4."
  },
  {
    caption: "getreg",
    value: "getreg()",
    meta: "Environment",
    snippet: "getreg()",
    docText: "Returns the Luau registry table containing references like threads and functions."
  },
  {
    caption: "getcallbackvalue",
    value: "getcallbackvalue()",
    meta: "Instance",
    snippet: "getcallbackvalue(${1:object}, \"${2:property}\")",
    docText: "Retrieves the assigned callback property (e.g. OnInvoke) from an instance."
  },
  {
    caption: "getinstances",
    value: "getinstances()",
    meta: "Instance",
    snippet: "getinstances()",
    docText: "Retrieves every Instance from the registry, including nil-parented ones."
  },
  {
    caption: "getnilinstances",
    value: "getnilinstances()",
    meta: "Instance",
    snippet: "getnilinstances()",
    docText: "Returns a list of Instances that are currently unparented (nil)."
  },
  {
    caption: "isrenderobj",
    value: "isrenderobj()",
    meta: "Drawing",
    snippet: "isrenderobj(${1:object})",
    docText: "Checks whether a given value is a valid Drawing object."
  },
  {
    caption: "getthreadidentity",
    value: "getthreadidentity()",
    meta: "Reflection",
    snippet: "getthreadidentity()",
    docText: "Retrieves the identity context level of the current thread."
  },
  {
    caption: "setthreadidentity",
    value: "setthreadidentity()",
    meta: "Reflection",
    snippet: "setthreadidentity(${1:id})",
    docText: "Sets the identity context level of the current thread."
  },
  {
    caption: "isscriptable",
    value: "isscriptable()",
    meta: "Reflection",
    snippet: "isscriptable(${1:instance}, \"${2:property}\")",
    docText: "Returns whether a property is scriptable (has no NotScriptable tag)."
  },
  {
    caption: "setscriptable",
    value: "setscriptable()",
    meta: "Reflection",
    snippet: "setscriptable(${1:instance}, \"${2:property}\", ${3:state})",
    docText: "Toggles the scriptability of a hidden or non-scriptable property."
  },
  {
    caption: "getcallingscript",
    value: "getcallingscript()",
    meta: "Scripts",
    snippet: "getcallingscript()",
    docText: "Returns the script that triggered the current code execution."
  },
  {
    caption: "getscriptclosure",
    value: "getscriptclosure()",
    meta: "Scripts",
    snippet: "getscriptclosure(${1:script})",
    docText: "Returns a new closure compiled from the script's bytecode."
  },
  {
    caption: "getscripthash",
    value: "getscripthash()",
    meta: "Scripts",
    snippet: "getscripthash(${1:script})",
    docText: "Returns a SHA-384 hash of the script's bytecode."
  },
  {
    caption: "loadstring",
    value: "loadstring()",
    meta: "Scripts",
    snippet: "loadstring(\"${1:code}\", \"${2:chunkname}\")",
    docText: "Compiles a string of Lua code into a runnable function."
  },
  {
    caption: "replicatesignal",
    value: "replicatesignal()",
    meta: "Signals",
    snippet: "replicatesignal(${1:signal}, ${2:args})",
    docText: "Replicates a signal fired on the client to the server."
  },
  { caption: "game", value: "game", meta: "Global", docText: "The DataModel, root of the game hierarchy." },
  { caption: "workspace", value: "workspace", meta: "Global", docText: "Alias for game.Workspace." },
  { caption: "script", value: "script", meta: "Global", docText: "Reference to the current script." },
  { caption: "shared", value: "shared", meta: "Global", docText: "A shared table across all scripts on the same machine level." },
  { caption: "_G", value: "_G", meta: "Global", docText: "A shared global table across all scripts on the same machine level." },
  { caption: "Enum", value: "Enum", meta: "Global", docText: "Standard Roblox Enums." },
  { caption: "Players", value: "game:GetService(\"Players\")", meta: "Service", docText: "Service for managing players." },
  { caption: "Lighting", value: "game:GetService(\"Lighting\")", meta: "Service", docText: "Service for managing lighting effects." },
  { caption: "ReplicatedStorage", value: "game:GetService(\"ReplicatedStorage\")", meta: "Service", docText: "Service for object storage replicated to clients." },
  { caption: "ReplicatedFirst", value: "game:GetService(\"ReplicatedFirst\")", meta: "Service", docText: "Service for objects replicated first to clients." },
  { caption: "StarterGui", value: "game:GetService(\"StarterGui\")", meta: "Service", docText: "Service holding GUIs to be copied to new players." },
  { caption: "StarterPack", value: "game:GetService(\"StarterPack\")", meta: "Service", docText: "Service holding tools to be copied to new players." },
  { caption: "StarterPlayer", value: "game:GetService(\"StarterPlayer\")", meta: "Service", docText: "Service holding default player and character scripts." },
  { caption: "CoreGui", value: "game:GetService(\"CoreGui\")", meta: "Service", docText: "Service for internal Roblox GUI elements (requires high privileges)." },
  { caption: "HttpService", value: "game:GetService(\"HttpService\")", meta: "Service", docText: "Service for HTTP requests and JSON encoding/decoding." },
  { caption: "TeleportService", value: "game:GetService(\"TeleportService\")", meta: "Service", docText: "Service for teleporting players between places." },
  { caption: "TweenService", value: "game:GetService(\"TweenService\")", meta: "Service", docText: "Service for creating tweens." },
  { caption: "RunService", value: "game:GetService(\"RunService\")", meta: "Service", docText: "Service for frame-by-frame management (RenderStepped, etc.)." },
  { caption: "UserInputService", value: "game:GetService(\"UserInputService\")", meta: "Service", docText: "Service for handling user input (keyboard, mouse, touch)." },
  { caption: "ContextActionService", value: "game:GetService(\"ContextActionService\")", meta: "Service", docText: "Service for binding actions to inputs." },
  { caption: "MarketplaceService", value: "game:GetService(\"MarketplaceService\")", meta: "Service", docText: "Service for handling purchases and product info." },
  { caption: "Debris", value: "game:GetService(\"Debris\")", meta: "Service", docText: "Service for scheduling object destruction." },
  { caption: "Teams", value: "game:GetService(\"Teams\")", meta: "Service", docText: "Service for managing teams." },
  { caption: "SoundService", value: "game:GetService(\"SoundService\")", meta: "Service", docText: "Service for managing global sound settings." },
  { caption: "Chat", value: "game:GetService(\"Chat\")", meta: "Service", docText: "Service for handling chat functionality." },
  { caption: "TextService", value: "game:GetService(\"TextService\")", meta: "Service", docText: "Service for text filtering and bounds measurement." },
  { caption: "LogService", value: "game:GetService(\"LogService\")", meta: "Service", docText: "Service for accessing output logs." },
  {
    caption: "UDim2.new",
    value: "UDim2.new()",
    meta: "UDim2",
    snippet: "UDim2.new(${1:scaleX}, ${2:offsetX}, ${3:scaleY}, ${4:offsetY})",
    docText: "Creates a new UDim2 (2D Universal Dimension)."
  },
  {
    caption: "UDim2.fromScale",
    value: "UDim2.fromScale()",
    meta: "UDim2",
    snippet: "UDim2.fromScale(${1:scaleX}, ${2:scaleY})",
    docText: "Creates a new UDim2 from scale values."
  },
  {
    caption: "UDim2.fromOffset",
    value: "UDim2.fromOffset()",
    meta: "UDim2",
    snippet: "UDim2.fromOffset(${1:offsetX}, ${2:offsetY})",
    docText: "Creates a new UDim2 from offset values."
  },
  {
    caption: "UDim.new",
    value: "UDim.new()",
    meta: "UDim",
    snippet: "UDim.new(${1:scale}, ${2:offset})",
    docText: "Creates a new UDim."
  },
  {
    caption: "BrickColor.new",
    value: "BrickColor.new()",
    meta: "BrickColor",
    snippet: "BrickColor.new(\"${1:name}\")",
    docText: "Creates a new BrickColor."
  },
  {
    caption: "BrickColor.random",
    value: "BrickColor.random()",
    meta: "BrickColor",
    snippet: "BrickColor.random()",
    docText: "Returns a random BrickColor."
  },
  {
    caption: "Ray.new",
    value: "Ray.new()",
    meta: "Ray",
    snippet: "Ray.new(${1:origin}, ${2:direction})",
    docText: "Creates a new Ray."
  },
  {
    caption: "Region3.new",
    value: "Region3.new()",
    meta: "Region3",
    snippet: "Region3.new(${1:min}, ${2:max})",
    docText: "Creates a new Region3."
  },
  {
    caption: "Rect.new",
    value: "Rect.new()",
    meta: "Rect",
    snippet: "Rect.new(${1:minX}, ${2:minY}, ${3:maxX}, ${4:maxY})",
    docText: "Creates a new Rect."
  },
  {
    caption: "TweenInfo.new",
    value: "TweenInfo.new()",
    meta: "TweenInfo",
    snippet: "TweenInfo.new(${1:time}, Enum.EasingStyle.${2:Linear}, Enum.EasingDirection.${3:Out})",
    docText: "Creates a new TweenInfo object."
  },
  {
    caption: "PhysicalProperties.new",
    value: "PhysicalProperties.new()",
    meta: "PhysicalProperties",
    snippet: "PhysicalProperties.new(${1:density}, ${2:friction}, ${3:elasticity})",
    docText: "Creates new PhysicalProperties."
  },
  {
    caption: "NumberSequence.new",
    value: "NumberSequence.new()",
    meta: "NumberSequence",
    snippet: "NumberSequence.new(${1:value})",
    docText: "Creates a NumberSequence."
  },
  {
    caption: "ColorSequence.new",
    value: "ColorSequence.new()",
    meta: "ColorSequence",
    snippet: "ColorSequence.new(${1:color})",
    docText: "Creates a ColorSequence."
  },
  {
    caption: "NumberRange.new",
    value: "NumberRange.new()",
    meta: "NumberRange",
    snippet: "NumberRange.new(${1:min}, ${2:max})",
    docText: "Creates a NumberRange."
  },
  {
    caption: "Instance.new",
    value: "Instance.new()",
    meta: "Instance",
    snippet: "Instance.new(\"${1:className}\")",
    docText: "Creates a new instance of the specified class."
  },
  {
    caption: "game:GetService",
    value: "game:GetService()",
    meta: "DataModel",
    snippet: "game:GetService(\"${1:ServiceName}\")",
    docText: "Returns the specified service."
  },
  { caption: "Destroy", value: "Destroy()", meta: "Method", snippet: "Destroy()", docText: "Sets the Parent of the Instance to nil, locks the Parent property, and disconnects all connections." },
  { caption: "Clone", value: "Clone()", meta: "Method", snippet: "Clone()", docText: "Creates a copy of the Instance and all of its descendants." },
  { caption: "WaitForChild", value: "WaitForChild()", meta: "Method", snippet: "WaitForChild(\"${1:name}\")", docText: "Yields the current thread until a child with the given name is found." },
  { caption: "FindFirstChild", value: "FindFirstChild()", meta: "Method", snippet: "FindFirstChild(\"${1:name}\")", docText: "Returns the first child of the Instance with the given name." },
  { caption: "Connect", value: "Connect()", meta: "Method", snippet: "Connect(function(${1:args})\n\t$0\nend)", docText: "Connects a function to an event." },
  { caption: "Wait", value: "Wait()", meta: "Method", snippet: "Wait()", docText: "Yields until the event fires and returns its arguments." },
  { caption: "Fire", value: "Fire()", meta: "Method", snippet: "Fire(${1:args})", docText: "Fires a BindableEvent or RemoteEvent." },
  { caption: "Invoke", value: "Invoke()", meta: "Method", snippet: "Invoke(${1:args})", docText: "Invokes a BindableFunction or RemoteFunction." },
  { caption: "GetChildren", value: "GetChildren()", meta: "Method", snippet: "GetChildren()", docText: "Returns a table containing all children of the Instance." },
  { caption: "GetDescendants", value: "GetDescendants()", meta: "Method", snippet: "GetDescendants()", docText: "Returns a table containing all descendants of the Instance." },
  { caption: "IsA", value: "IsA()", meta: "Method", snippet: "IsA(\"${1:className}\")", docText: "Returns true if the Instance is of the given class or subclass." },
  { caption: "GetAttribute", value: "GetAttribute()", meta: "Method", snippet: "GetAttribute(\"${1:attribute}\")", docText: "Returns the value of the given attribute." },
  { caption: "SetAttribute", value: "SetAttribute()", meta: "Method", snippet: "SetAttribute(\"${1:attribute}\", ${2:value})", docText: "Sets the value of the given attribute." },
  { caption: "GetDataStore", value: "GetDataStore()", meta: "DataStore", snippet: "GetDataStore(\"${1:name}\", \"${2:scope}\")", docText: "Returns a DataStore." },
  { caption: "GetOrderedDataStore", value: "GetOrderedDataStore()", meta: "DataStore", snippet: "GetOrderedDataStore(\"${1:name}\", \"${2:scope}\")", docText: "Returns an OrderedDataStore." },
  { caption: "GetAsync", value: "GetAsync()", meta: "DataStore", snippet: "GetAsync(\"${1:key}\")", docText: "Returns the value of the given key." },
  { caption: "SetAsync", value: "SetAsync()", meta: "DataStore", snippet: "SetAsync(\"${1:key}\", ${2:value})", docText: "Sets the value of the given key." },
  { caption: "UpdateAsync", value: "UpdateAsync()", meta: "DataStore", snippet: "UpdateAsync(\"${1:key}\", function(${2:oldValue})\n\t$0\nend)", docText: "Updates the value of the given key." },
  { caption: "RemoveAsync", value: "RemoveAsync()", meta: "DataStore", snippet: "RemoveAsync(\"${1:key}\")", docText: "Removes the value of the given key." },
  { caption: "IncrementAsync", value: "IncrementAsync()", meta: "DataStore", snippet: "IncrementAsync(\"${1:key}\", ${2:delta})", docText: "Increments the value of the given key." },
  { caption: "MoveTo", value: "MoveTo()", meta: "Humanoid", snippet: "MoveTo(${1:position})", docText: "Makes the Humanoid walk to the given position." },
  { caption: "Jump", value: "Jump()", meta: "Humanoid", snippet: "Jump()", docText: "Makes the Humanoid jump." },
  { caption: "ChangeState", value: "ChangeState()", meta: "Humanoid", snippet: "ChangeState(Enum.HumanoidStateType.${1:state})", docText: "Changes the state of the Humanoid." },
  { caption: "TakeDamage", value: "TakeDamage()", meta: "Humanoid", snippet: "TakeDamage(${1:amount})", docText: "Deals damage to the Humanoid." },
  { caption: "AddAccessory", value: "AddAccessory()", meta: "Humanoid", snippet: "AddAccessory(${1:accessory})", docText: "Attaches an accessory to the Humanoid." },
  { caption: "PromptGamePassPurchase", value: "PromptGamePassPurchase()", meta: "Marketplace", snippet: "PromptGamePassPurchase(${1:player}, ${2:passId})", docText: "Prompts the player to buy a game pass." },
  { caption: "PromptProductPurchase", value: "PromptProductPurchase()", meta: "Marketplace", snippet: "PromptProductPurchase(${1:player}, ${2:productId})", docText: "Prompts the player to buy a developer product." },
  { caption: "PromptPremiumPurchase", value: "PromptPremiumPurchase()", meta: "Marketplace", snippet: "PromptPremiumPurchase(${1:player})", docText: "Prompts the player to buy Premium." },
  { caption: "GetProductInfo", value: "GetProductInfo()", meta: "Marketplace", snippet: "GetProductInfo(${1:assetId}, Enum.InfoType.${2:Asset})", docText: "Returns info about an asset." },
  { caption: "PlayerOwnsAsset", value: "PlayerOwnsAsset()", meta: "Marketplace", snippet: "PlayerOwnsAsset(${1:player}, ${2:assetId})", docText: "Returns true if the player owns the asset." },
  { caption: "Name", value: "Name", meta: "Property", docText: "The name of the Instance." },
  { caption: "Parent", value: "Parent", meta: "Property", docText: "The parent of the Instance." },
  { caption: "Value", value: "Value", meta: "Property", docText: "The value of a Value object (e.g. StringValue, IntValue)." },
  { caption: "Position", value: "Position", meta: "Property", docText: "The Vector3 position of a BasePart." },
  { caption: "Size", value: "Size", meta: "Property", docText: "The Vector3 size of a BasePart." },
  { caption: "Anchored", value: "Anchored", meta: "Property", docText: "Determines if the part is affected by physics." },
  { caption: "CanCollide", value: "CanCollide", meta: "Property", docText: "Determines if the part can collide with other parts." },
  { caption: "CFrame", value: "CFrame", meta: "Property", docText: "The CFrame (coordinate frame) of a BasePart." },
  { caption: "Humanoid", value: "Humanoid", meta: "Property", docText: "The Humanoid object within a Model (usually a character)." },
  { caption: "Character", value: "Character", meta: "Property", docText: "The model representing the player's character." },
  { caption: "LocalPlayer", value: "LocalPlayer", meta: "Property", docText: "A reference to the client's Player object." },
  { caption: "Touched", value: "Touched", meta: "Event", docText: "Fires when a Part touches another Part." },
  { caption: "TouchEnded", value: "TouchEnded", meta: "Event", docText: "Fires when a Part stops touching another Part." },
  { caption: "Transparency", value: "Transparency", meta: "Property", docText: "The transparency of a BasePart or GUI element (0-1)." },
  { caption: "Reflectance", value: "Reflectance", meta: "Property", docText: "The reflectance of a BasePart (0-1)." },
  { caption: "Material", value: "Material", meta: "Property", docText: "The material of a BasePart." },
  { caption: "BrickColor", value: "BrickColor", meta: "Property", docText: "The BrickColor of a BasePart." },
  { caption: "Color", value: "Color", meta: "Property", docText: "The Color3 of a BasePart or GUI element." },
  { caption: "WalkSpeed", value: "WalkSpeed", meta: "Property", docText: "The walking speed of a Humanoid." },
  { caption: "JumpPower", value: "JumpPower", meta: "Property", docText: "The jumping power of a Humanoid." },
  { caption: "JumpHeight", value: "JumpHeight", meta: "Property", docText: "The jumping height of a Humanoid." },
  { caption: "Health", value: "Health", meta: "Property", docText: "The current health of a Humanoid." },
  { caption: "MaxHealth", value: "MaxHealth", meta: "Property", docText: "The maximum health of a Humanoid." },
  { caption: "AutoRotate", value: "AutoRotate", meta: "Property", docText: "Whether the Humanoid automatically rotates to face movement direction." },
  {
    caption: "Vector3.new",
    value: "Vector3.new()",
    meta: "Vector3",
    snippet: "Vector3.new(${1:x}, ${2:y}, ${3:z})",
    docText: "Creates a new Vector3."
  },
  {
    caption: "CFrame.new",
    value: "CFrame.new()",
    meta: "CFrame",
    snippet: "CFrame.new(${1:x}, ${2:y}, ${3:z})",
    docText: "Creates a new CFrame."
  },
  {
    caption: "Color3.new",
    value: "Color3.new()",
    meta: "Color3",
    snippet: "Color3.new(${1:r}, ${2:g}, ${3:b})",
    docText: "Creates a new Color3 (RGB values 0-1)."
  },
  {
    caption: "Color3.fromRGB",
    value: "Color3.fromRGB()",
    meta: "Color3",
    snippet: "Color3.fromRGB(${1:r}, ${2:g}, ${3:b})",
    docText: "Creates a new Color3 (RGB values 0-255)."
  },
  { caption: "print", value: "print()", meta: "Function", snippet: "print(${1:message})", docText: "Prints values to the output." },
  { caption: "pairs", value: "pairs()", meta: "Function", snippet: "pairs(${1:table})", docText: "Returns an iterator function for traversing a table." },
  { caption: "ipairs", value: "ipairs()", meta: "Function", snippet: "ipairs(${1:table})", docText: "Returns an iterator function for integer-indexed tables." },
  { caption: "type", value: "type()", meta: "Function", snippet: "type(${1:value})", docText: "Returns the type of the value as a string." },
  { caption: "tonumber", value: "tonumber()", meta: "Function", snippet: "tonumber(${1:value})", docText: "Converts a string to a number." },
  { caption: "tostring", value: "tostring()", meta: "Function", snippet: "tostring(${1:value})", docText: "Converts a value to a string." },
  { caption: "pcall", value: "pcall()", meta: "Function", snippet: "pcall(${1:func}, ${2:...args})", docText: "Calls a function in protected mode, catching errors." },
  { caption: "require", value: "require()", meta: "Function", snippet: "require(${1:module})", docText: "Loads a module." },
  { caption: "wait", value: "wait()", meta: "Function", snippet: "wait(${1:seconds})", docText: "Yields the current thread (Deprecated, use task.wait)." },
  { caption: "warn", value: "warn()", meta: "Function", snippet: "warn(${1:message})", docText: "Prints a warning to the output." },
  { caption: "error", value: "error()", meta: "Function", snippet: "error(${1:message})", docText: "Terminates the last protected function call." },
  { caption: "getrawmetatable", value: "getrawmetatable()", meta: "Function", snippet: "getrawmetatable(${1:object})", docText: "Retrieves the metatable of a value, bypassing __metatable." },
  { caption: "setrawmetatable", value: "setrawmetatable()", meta: "Function", snippet: "setrawmetatable(${1:object}, ${2:metatable})", docText: "Sets the metatable of a value, bypassing protections." },
  { caption: "getsenv", value: "getsenv()", meta: "Function", snippet: "getsenv(${1:script})", docText: "Returns the environment of the specified LocalScript." },
  { caption: "setfenv", value: "setfenv()", meta: "Function", snippet: "setfenv(${1:func}, ${2:env})", docText: "Sets the environment of a function." },
  { caption: "assert", value: "assert()", meta: "Function", snippet: "assert(${1:condition}, ${2:message})", docText: "Raises an error if condition is false or nil." },
  { caption: "xpcall", value: "xpcall()", meta: "Function", snippet: "xpcall(${1:func}, ${2:handler}, ${3:...args})", docText: "Extended pcall with custom error handler." },
  { caption: "select", value: "select()", meta: "Function", snippet: "select(${1:index}, ${2:...args})", docText: "Selects elements from a vararg list." },
  { caption: "unpack", value: "unpack()", meta: "Function", snippet: "unpack(${1:table}, ${2:i}, ${3:j})", docText: "Returns elements from a table." },
  { caption: "collectgarbage", value: "collectgarbage()", meta: "Function", snippet: "collectgarbage(\"${1:opt}\")", docText: "Controls the garbage collector." },
  { caption: "table.insert", value: "table.insert()", meta: "Table", snippet: "table.insert(${1:table}, ${2:value})", docText: "Inserts a value into a table." },
  { caption: "table.remove", value: "table.remove()", meta: "Table", snippet: "table.remove(${1:table}, ${2:pos})", docText: "Removes a value from a table at a specific position." },
  { caption: "table.find", value: "table.find()", meta: "Table", snippet: "table.find(${1:table}, ${2:value})", docText: "Finds the index of a value in a table." },
  { caption: "table.concat", value: "table.concat()", meta: "Table", snippet: "table.concat(${1:table}, ${2:sep})", docText: "Concatenates table elements into a string." },
  { caption: "table.clear", value: "table.clear()", meta: "Table", snippet: "table.clear(${1:table})", docText: "Removes all elements from the table." },
  { caption: "task.wait", value: "task.wait()", meta: "Task", snippet: "task.wait(${1:duration})", docText: "Yields the current thread for the specified duration." },
  { caption: "task.spawn", value: "task.spawn()", meta: "Task", snippet: "task.spawn(${1:func})", docText: "Runs a function in a new thread immediately." },
  { caption: "task.defer", value: "task.defer()", meta: "Task", snippet: "task.defer(${1:func})", docText: "Defers a function to run at the end of the frame." },
  { caption: "task.delay", value: "task.delay()", meta: "Task", snippet: "task.delay(${1:time}, ${2:func})", docText: "Schedules a function to run after a delay." },
  { caption: "task.desynchronize", value: "task.desynchronize()", meta: "Task", snippet: "task.desynchronize()", docText: "Enters parallel execution mode." },
  { caption: "task.synchronize", value: "task.synchronize()", meta: "Task", snippet: "task.synchronize()", docText: "Enters serial execution mode." },
  { caption: "bit32.band", value: "bit32.band()", meta: "bit32", snippet: "bit32.band(${1:a}, ${2:b})", docText: "Bitwise AND." },
  { caption: "bit32.bor", value: "bit32.bor()", meta: "bit32", snippet: "bit32.bor(${1:a}, ${2:b})", docText: "Bitwise OR." },
  { caption: "bit32.bxor", value: "bit32.bxor()", meta: "bit32", snippet: "bit32.bxor(${1:a}, ${2:b})", docText: "Bitwise XOR." },
  { caption: "bit32.lshift", value: "bit32.lshift()", meta: "bit32", snippet: "bit32.lshift(${1:x}, ${2:disp})", docText: "Logical left shift." },
  { caption: "bit32.rshift", value: "bit32.rshift()", meta: "bit32", snippet: "bit32.rshift(${1:x}, ${2:disp})", docText: "Logical right shift." },
  { caption: "bit32.bnot", value: "bit32.bnot()", meta: "bit32", snippet: "bit32.bnot(${1:x})", docText: "Bitwise NOT." },
  { caption: "coroutine.create", value: "coroutine.create()", meta: "Coroutine", snippet: "coroutine.create(${1:func})", docText: "Creates a new coroutine." },
  { caption: "coroutine.resume", value: "coroutine.resume()", meta: "Coroutine", snippet: "coroutine.resume(${1:thread})", docText: "Starts or resumes a coroutine." },
  { caption: "coroutine.yield", value: "coroutine.yield()", meta: "Coroutine", snippet: "coroutine.yield()", docText: "Suspends the current coroutine." },
  { caption: "coroutine.status", value: "coroutine.status()", meta: "Coroutine", snippet: "coroutine.status(${1:thread})", docText: "Returns the status of the coroutine." },
  { caption: "string.split", value: "string.split()", meta: "String", snippet: "${1:str}:split(\"${2:separator}\")", docText: "Splits a string by separator." },
  { caption: "string.gsub", value: "string.gsub()", meta: "String", snippet: "string.gsub(${1:str}, \"${2:pattern}\", \"${3:replace}\")", docText: "Replaces pattern matches in a string." },
  { caption: "math.random", value: "math.random()", meta: "Math", snippet: "math.random(${1:min}, ${2:max})", docText: "Returns a random number." },
  { caption: "math.clamp", value: "math.clamp()", meta: "Math", snippet: "math.clamp(${1:value}, ${2:min}, ${3:max})", docText: "Clamps a value between min and max." },
  { caption: "mouse1click", value: "mouse1click()", meta: "Input", snippet: "mouse1click()", docText: "Simulates a left mouse button click." },
  { caption: "mouse1press", value: "mouse1press()", meta: "Input", snippet: "mouse1press()", docText: "Simulates holding down the left mouse button." },
  { caption: "mouse1release", value: "mouse1release()", meta: "Input", snippet: "mouse1release()", docText: "Simulates releasing the left mouse button." },
  { caption: "mouse2click", value: "mouse2click()", meta: "Input", snippet: "mouse2click()", docText: "Simulates a right mouse button click." },
  { caption: "mouse2press", value: "mouse2press()", meta: "Input", snippet: "mouse2press()", docText: "Simulates holding down the right mouse button." },
  { caption: "mouse2release", value: "mouse2release()", meta: "Input", snippet: "mouse2release()", docText: "Simulates releasing the right mouse button." },
  { caption: "mousescroll", value: "mousescroll()", meta: "Input", snippet: "mousescroll(${1:pixels})", docText: "Simulates scrolling the mouse wheel." },
  { caption: "mousemoverel", value: "mousemoverel()", meta: "Input", snippet: "mousemoverel(${1:x}, ${2:y})", docText: "Moves the mouse cursor relative to its current position." },
  { caption: "mousemoveabs", value: "mousemoveabs()", meta: "Input", snippet: "mousemoveabs(${1:x}, ${2:y})", docText: "Moves the mouse cursor to a specific absolute position." },
  { caption: "keypress", value: "keypress()", meta: "Input", snippet: "keypress(${1:keycode})", docText: "Simulates a key press." },
  { caption: "keyrelease", value: "keyrelease()", meta: "Input", snippet: "keyrelease(${1:keycode})", docText: "Simulates a key release." },
  { caption: "local", value: "local", meta: "Keyword", docText: "Declares a local variable" },
  { caption: "function", value: "function", meta: "Keyword", docText: "Declares a function" },
  { caption: "if", value: "if", meta: "Keyword", docText: "Starts an if statement" },
  { caption: "then", value: "then", meta: "Keyword", docText: "Used after if condition" },
  { caption: "else", value: "else", meta: "Keyword", docText: "Alternative branch in if statement" },
  { caption: "elseif", value: "elseif", meta: "Keyword", docText: "Additional condition in if statement" },
  { caption: "end", value: "end", meta: "Keyword", docText: "Ends a block statement" },
  { caption: "for", value: "for", meta: "Keyword", docText: "Starts a for loop" },
  { caption: "in", value: "in", meta: "Keyword", docText: "Iterator operator used in for loops" },
  { caption: "while", value: "while", meta: "Keyword", docText: "Starts a while loop" },
  { caption: "do", value: "do", meta: "Keyword", docText: "Starts a do block" },
  { caption: "repeat", value: "repeat", meta: "Keyword", docText: "Starts a repeat-until loop" },
  { caption: "until", value: "until", meta: "Keyword", docText: "Ends a repeat-until loop" },
  { caption: "break", value: "break", meta: "Keyword", docText: "Exits a loop" },
  { caption: "return", value: "return", meta: "Keyword", docText: "Returns from a function" },
  { caption: "continue", value: "continue", meta: "Keyword", docText: "Skips to the next iteration of a loop" },
  { caption: "nil", value: "nil", meta: "Keyword", docText: "Represents no value or invalid value" },
  { caption: "true", value: "true", meta: "Keyword", docText: "Boolean true value" },
  { caption: "false", value: "false", meta: "Keyword", docText: "Boolean false value" },
  { caption: "self", value: "self", meta: "Keyword", docText: "Reference to the current object in methods" },
  { caption: "and", value: "and", meta: "Logical Operator", docText: "Logical AND operator" },
  { caption: "or", value: "or", meta: "Logical Operator", docText: "Logical OR operator" },
  { caption: "not", value: "not", meta: "Logical Operator", docText: "Logical NOT operator" },
];
const USAGE_FILE = 'completions.json';
let usageCounts: Record<string, number> = {};
let isInitialized = false;
export const initUsageData = async (): Promise<void> => {
  if (isInitialized) return;
  try {
    const dir = await appDataDir();
    const path = await join(dir, USAGE_FILE);
    const fileExists = await exists(path);
    if (fileExists) {
      const content = await readTextFile(path);
      usageCounts = JSON.parse(content);
    } else {
      await mkdir(dir, { recursive: true });
      await writeTextFile(path, JSON.stringify({}, null, 2));
      usageCounts = {};
    }
  } catch {
    usageCounts = {};
  }
  isInitialized = true;
};
const saveUsageCounts = async (): Promise<void> => {
  try {
    const dir = await appDataDir();
    const path = await join(dir, USAGE_FILE);
    await writeTextFile(path, JSON.stringify(usageCounts, null, 2));
  } catch {
  }
};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hasPendingChanges = false;
const debouncedSave = (): void => {
  hasPendingChanges = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    if (hasPendingChanges) {
      saveUsageCounts();
      hasPendingChanges = false;
    }
    saveTimer = null;
  }, 30000);
};
export const updateUsageCount = (value: string): void => {
  const key = value.split('(')[0];
  usageCounts[key] = (usageCounts[key] || 0) + 1;
  debouncedSave();
};
export const getDefs = (): CompletionItem[] => {
  return definitions.map(def => {
    const key = def.value.split('(')[0];
    const usage = usageCounts[key] || 0;
    return {
      ...def,
      score: (def.score || 0) + (usage * 100)
    };
  });
};
initUsageData();
export const completer = {
  getCompletions: async (_editor: any, session: any, pos: any, prefix: string, callback: any) => {
    if (!isInitialized) {
      await initUsageData();
    }
    const token = session.getTokenAt(pos.row, pos.column);
    if (token && (token.type === "string" || token.type === "comment")) {
      callback(null, []);
      return;
    }
    const line = session.getLine(pos.row).substring(0, pos.column);
    const openParens = (line.match(/\(/g) || []).length;
    const closeParens = (line.match(/\)/g) || []).length;
    if (openParens > closeParens) {
      callback(null, []);
      return;
    }
    if (/\d+[a-z]+$/i.test(line)) {
      callback(null, []);
      return;
    }
    const fullLine = session.getLine(pos.row);
    const triggerCharIndex = pos.column - prefix.length - 1;
    const triggerChar = fullLine.charAt(triggerCharIndex);
    const defs = getDefs();
    let validItems = defs;
    if (triggerChar === ':') {
      validItems = defs.filter(d => d.meta === "Method");
    } else if (triggerChar === '.') {
      validItems = defs.filter(d => d.meta === "Method" || d.meta === "Property" || d.meta === "Member" || d.value.includes("."));
    } else {
      validItems = defs.filter(d => d.meta !== "Method" && d.meta !== "Property");
    }
    validItems.sort((a, b) => (b.score || 0) - (a.score || 0));
    callback(null, validItems);
  },
};

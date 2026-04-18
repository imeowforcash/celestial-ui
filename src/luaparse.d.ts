declare module 'luaparse' {
  export interface ParseOptions {
    wait?: boolean;
    comments?: boolean;
    scope?: boolean;
    locations?: boolean;
    ranges?: boolean;
    luaVersion?: '5.1' | '5.2' | '5.3' | 'LuaJIT';
  }

  export interface Node {
    type: string;
    loc?: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
    range?: [number, number];
    [key: string]: any;
  }

  export function parse(code: string, options?: ParseOptions): Node;
  
  const luaparse: {
    parse: typeof parse;
  };
  
  export default luaparse;
}

import luaparse from 'luaparse';

export interface LuaError {
  row: number;
  column: number;
  text: string;
  type: 'error' | 'warning' | 'info';
}

export class validator {
  validate(code: string): LuaError[] {
    const errors: LuaError[] = [];

    try {
      luaparse.parse(code, {
        luaVersion: '5.1'
      });
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "line" in err && typeof err.line === "number") {
        errors.push({
          row: err.line - 1,
          column: "column" in err && typeof err.column === "number" ? err.column : 0,
          text: "message" in err && typeof err.message === "string"
            ? err.message.replace(/^[\[\d+:\d+\]]\s*/, '')
            : "",
          type: 'error'
        });
      }
    }

    const lines = code.split('\n');
    lines.forEach((line, row) => {
      const trimmed = line.trim();

      if (!trimmed.startsWith('--')) {
        let cleanLine = line.replace(/\\['"]/g, '');
        
        cleanLine = cleanLine.replace(/"[^"]*"/g, '""');
        
        const cleanForDouble = line.replace(/\\['"]/g, '').replace(/'[^']*'/g, "''");
        
        const singleQuotes = (cleanLine.match(/'/g) || []).length;
        const doubleQuotes = (cleanForDouble.match(/"/g) || []).length;
        
        if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
           if (!errors.some(e => e.row === row)) {
             errors.push({
               row,
               column: line.length,
               text: 'Unterminated string',
               type: 'error'
             });
           }
        }
      }

      if (/^(if|elseif)\b/.test(trimmed) && !/\bthen\b/.test(trimmed)) {
         if (!errors.some(e => e.row === row)) {
             const lastTokenCol = this.getLastTokenIndex(line);
             errors.push({
               row,
               column: lastTokenCol,
               text: "Missing 'then'",
               type: 'error'
             });
         }
      }

      if (/^(while|for)\b/.test(trimmed) && !/\bdo\b/.test(trimmed)) {
         if (!errors.some(e => e.row === row)) {
           const lastTokenCol = this.getLastTokenIndex(line);
           errors.push({
             row,
             column: lastTokenCol,
             text: "Missing 'do' after loop",
             type: 'error'
           });
         }
      }

      if (/\bwait\(/.test(line) && !/task\.wait\(/.test(line)) {
        errors.push({
          row,
          column: line.indexOf('wait('),
          text: "Deprecated: use 'task.wait()' instead",
          type: 'warning'
        });
      }

      if (/LocalPlayer/.test(line)) {
        errors.push({
          row,
          column: line.indexOf('LocalPlayer'),
          text: 'LocalPlayer only works in LocalScripts',
          type: 'warning'
        });
      }

      if (/Instance\.new\(\s*\)/.test(line)) {
        errors.push({
          row,
          column: line.indexOf('Instance.new'),
          text: 'Instance.new() requires a class name',
          type: 'error'
        });
      }

      if (/==\s*nil/.test(line)) {
        errors.push({
          row,
          column: line.indexOf('=='),
          text: "Use 'if not value' instead of '== nil'",
          type: 'warning'
        });
      }

      if (/\bDestory\b/.test(line)) {
        errors.push({
          row,
          column: line.search(/Destory/),
          text: "Did you mean 'Destroy'?",
          type: 'error'
        });
      }

      const dotMethodMatch = line.match(/\.(Play|Connect|Wait|Clone|Remove)\(/);
      if (dotMethodMatch) {
         errors.push({
           row,
           column: line.indexOf(dotMethodMatch[0]),
           text: `Method '${dotMethodMatch[1]}' should likely be called with ':' (e.g. :${dotMethodMatch[1]}())`,
           type: 'warning'
         });
      }

      if (!trimmed.startsWith('--')) {
         let structure = line.replace(/--.*/, '');
         structure = structure.replace(/"([^"\\]|\\.)*"/g, '""');
         structure = structure.replace(/'([^'\\]|\\.)*'/g, "''");
         structure = structure.trim();
         
         const openParens = (structure.match(/\(/g) || []).length;
         const closeParens = (structure.match(/\)/g) || []).length;
         
         if (openParens > closeParens) {
           if (/[\w\]})'"]$/.test(structure) && 
               !/\b(function|then|do|repeat|else)\s*$/.test(structure) && 
               !/function\s*\([^\)]*\)\s*$/.test(structure)) {
               if (!errors.some(e => e.row === row)) {
                   const lastTokenCol = this.getLastTokenIndex(line);
                   errors.push({
                       row,
                       column: lastTokenCol,
                       text: "Possible missing closing ')'",
                       type: 'error'
                   });
               }
           }
         }
      }
      if (/\bif\b/.test(line) && /(?<![<>=~])=(?![=])/.test(line)) {
          const clean = line.replace(/--.*/, '');
          if (/\bif\b.*\s+(?<![<>=~])=(?![=])\s+/.test(clean)) {
              errors.push({
                  row,
                  column: line.indexOf('='),
                  text: "Expected '==' for comparison, found assignment '='",
                  type: 'error'
              });
          }
      }

      if (/[}\]"'\w]\s+[a-zA-Z_]\w*\s*=[^=]/.test(line) && !line.includes('local ')) {
          const clean = line.replace(/--.*/, '');
          const match = /([}\]"'\w])\s+([a-zA-Z_]\w*)\s*=/.exec(clean);
          if (match && match.index !== undefined) {
             if (line.includes('{') || line.includes('}')) {
                 errors.push({
                     row,
                     column: match.index + 1,
                     text: "Missing comma or semicolon between table fields",
                     type: 'error'
                 });
             }
          }
      }
    });

    return errors;
  }

  private getLastTokenIndex(line: string): number {
      const clean = line.replace(/--.*/, '').trimEnd();
      if (!clean) return 0;
      
      const match = /([\w]+|[^\s\w]+)$/.exec(clean);
      return match ? match.index : clean.length - 1;
  }
}

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export function appPath(path:string){return path.startsWith('/')?basePath+path:path;}
export function stripBasePath(path:string){return basePath&&(path===basePath||path.startsWith(basePath+'/'))?path.slice(basePath.length)||'/':path;}

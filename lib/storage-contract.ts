export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T=Record<string,unknown>>(): Promise<T|null>;
  all<T=Record<string,unknown>>(): Promise<{results:T[]}>;
  run(): Promise<{meta:{changes:number}}>;
}
export interface Storage {
  DB:{prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown>};
  BUCKET:{put(key:string,bytes:Uint8Array,options?:unknown):Promise<unknown>;get(key:string):Promise<{body:BodyInit}|null>;delete(key:string):Promise<unknown>};
}

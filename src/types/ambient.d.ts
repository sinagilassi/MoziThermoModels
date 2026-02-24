declare module "mozicuc" {
  export function to(value: number, expr: string): number;
}

declare module "mozithermodb-settings" {
  export type Component = any;
  export type Temperature = any;
  export type Pressure = any;
  export type CustomProp = any;
  export type CustomProperty = any;
}

declare function require(name: string): any;

declare module "vitest" {
  export const describe: any;
  export const it: any;
  export const expect: any;
}

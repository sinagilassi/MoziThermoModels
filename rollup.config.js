import { builtinModules } from "node:module";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import tsconfigPaths from "rollup-plugin-tsconfig-paths";
import pkg from "./package.json" with { type: "json" };

const extensions = [".mjs", ".js", ".json", ".ts"];

const externalDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
]);

const isExternal = (id) => {
    if (id.startsWith("\0")) {
        return false;
    }

    const cleanId = id.split("?")[0].split("#")[0];

    if (cleanId.startsWith(".") || cleanId.startsWith("/") || cleanId.startsWith("@/")) {
        return false;
    }

    if (cleanId.startsWith("node:")) {
        return true;
    }

    const [scopeOrName, maybeName] = cleanId.split("/");
    const packageName = scopeOrName.startsWith("@") && maybeName
        ? `${scopeOrName}/${maybeName}`
        : scopeOrName;

    return externalDeps.has(cleanId) || externalDeps.has(packageName);
};

const baseJsPlugins = [
    tsconfigPaths(),
    nodeResolve({ extensions }),
    typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false,
        noEmitOnError: true,
    }),
];

export default [
    {
        input: "src/index.ts",
        external: isExternal,
        plugins: baseJsPlugins,
        output: [
            {
                file: "dist/index.mjs",
                format: "es",
                sourcemap: true,
            },
            {
                file: "dist/index.cjs",
                format: "cjs",
                exports: "named",
                sourcemap: true,
            },
        ],
    },
    {
        input: "src/index.ts",
        external: isExternal,
        plugins: [
            tsconfigPaths(),
            nodeResolve({ extensions, browser: true, preferBuiltins: false }),
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: false,
                declarationMap: false,
                noEmitOnError: true,
            }),
        ],
        output: {
            file: "dist/index.browser.mjs",
            format: "es",
            sourcemap: true,
        },
    },
    {
        input: "src/index.ts",
        external: isExternal,
        plugins: [tsconfigPaths(), dts({ tsconfig: "./tsconfig.json" })],
        output: {
            file: "dist/index.d.ts",
            format: "es",
        },
    },
];

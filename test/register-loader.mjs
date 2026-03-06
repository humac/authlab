import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./test/node-loader.mjs", pathToFileURL("./"));

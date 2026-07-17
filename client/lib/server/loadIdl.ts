
import fs from "fs";
import path from "path";
import type { Idl } from "@anchor-lang/core";

export async function loadIdlFromFs(): Promise<Idl> {
  const idlPath = path.join(
    process.cwd(),
    "public",
    "idl",
    "arcrypt.json"
  );

  const raw = await fs.promises.readFile(idlPath, "utf8");
  return JSON.parse(raw) as Idl;
}

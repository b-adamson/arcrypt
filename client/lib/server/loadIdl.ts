
import fs from "fs";
import path from "path";
import * as anchor from "@coral-xyz/anchor";

export async function loadIdlFromFs(): Promise<anchor.Idl> {
  const idlPath = path.join(
    process.cwd(),
    "public",
    "idl",
    "arcrypt.json"
  );

  const raw = await fs.promises.readFile(idlPath, "utf8");
  return JSON.parse(raw);
}
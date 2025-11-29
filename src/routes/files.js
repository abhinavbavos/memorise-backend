import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { signGet } from "../controllers/fileController.js";
import { ownS3Key } from "../middleware/ownership.js";

const r = Router();
// /files/sign?key=...
r.get("/sign", auth(), ownS3Key("key"), signGet);

export default r;

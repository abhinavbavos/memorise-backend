import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
  listByUser,
  listMine,
  createTrophy,
  removeTrophy,
} from "../controllers/trophyController.js";

const r = Router();

r.get("/user/:id", listByUser);
r.get("/me", auth(), listMine);
r.post("/", auth(), createTrophy);
r.delete("/:id", auth(), removeTrophy);

export default r;

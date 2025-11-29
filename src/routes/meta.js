// routes/meta.js
import { Router } from "express";
import { listCategories } from "../controllers/metaController.js";
const r = Router();

r.get("/categories", listCategories);

export default r;

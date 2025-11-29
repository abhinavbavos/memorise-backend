import { Router } from "express";
import { limitAuth } from "../middleware/limits.js";
import {
  login,
  register,
  changePassword,
} from "../controllers/authController.js";
import { auth } from "../middleware/auth.js";

const r = Router();
r.post("/login", limitAuth, login);
r.post("/register", limitAuth, register);
r.post("/change-password", auth(), changePassword);

export default r;

import Joi from "joi";

export const validate =
  (schema, where = "body") =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[where]);
    if (error) return res.status(400).json({ error: error.message });
    req[where] = value;
    next();
  };

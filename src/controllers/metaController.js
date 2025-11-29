// controllers/metaController.js
export function listCategories(req, res) {
  res.json(["Awards", "Certificates", "Academics", "Sports", "Internship"]);
}

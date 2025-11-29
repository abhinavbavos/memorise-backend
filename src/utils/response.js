export const ok = (res, data = {}, status = 200) => res.status(status).json(data);
export const fail = (res, message = 'Bad request', status = 400) => res.status(status).json({ error: message });

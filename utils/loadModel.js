export const loadModel = (conn, name, schema) => {
  if (conn.models[name]) {
    return conn.models[name];
  }
  return conn.model(name, schema);
};

import mongoose from "mongoose";

const oldUri = "mongodb+srv://aurifydxb:gON1GD2tNjq0QG1j@aurifycluster.rdzxh.mongodb.net/Bulliontest-mh";
const newUri = "mongodb+srv://aurifydxb:gON1GD2tNjq0QG1j@aurifycluster.rdzxh.mongodb.net/bullion-shamil-test-DB";

async function cloneDatabase() {
  const oldConn = await mongoose.createConnection(oldUri).asPromise();
  const newConn = await mongoose.createConnection(newUri).asPromise();

  const collections = await oldConn.db.listCollections().toArray();
  console.log("Cloning collections:", collections.map(c => c.name));

  for (const { name } of collections) {
    const data = await oldConn.db.collection(name).find().toArray();
    if (data.length > 0) {
      await newConn.db.collection(name).insertMany(data);
      console.log(`✅ Cloned ${data.length} docs → ${name}`);
    }
  }

  await oldConn.close();
  await newConn.close();
  console.log("🎉 Clone completed!");
}

cloneDatabase().catch(console.error);

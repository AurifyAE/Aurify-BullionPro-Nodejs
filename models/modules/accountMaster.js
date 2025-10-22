import mongoose from "mongoose";

function generateUniqId() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `AUR${randomNum}`;
}

const accountMasterSchema = new mongoose.Schema({
  uniqId: {
    type: String,
    unique: true,
    default: generateUniqId
  },
  name: {
    type: String,
    required: true
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  deleted: {
    type: Boolean,
    default: false
  },
});

const AccountMaster = mongoose.model('AccountMaster', accountMasterSchema);

export default AccountMaster;
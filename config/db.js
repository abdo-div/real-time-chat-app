import mongoose from "mongoose";
import dns from "node:dns";
import User from "../models/User.js";

// Force Node to use Google and Cloudflare DNS for Atlas SRV records
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    // Reset any stale "online" statuses left behind by crashes/restarts, so no
    // user is stuck showing as online. Live sockets re-mark themselves online
    // on the next connect.
    await User.updateMany({}, { status: "offline" });

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;

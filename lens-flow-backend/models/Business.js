import mongoose from "mongoose";
import bcrypt from "bcrypt";

const businessSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
    },  
});

userSchema.pre("save", async function(next) {
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = bcrypt.hash(this.password, salt);
    next();
})

const Business = mongoose.model("Business", businessSchema);

export default Business;
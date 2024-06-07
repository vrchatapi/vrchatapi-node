import { VRChat, getCurrentUser } from "../"

const vrchat = new VRChat({
	application: {
		name: "Example",
		version: 1,
		contact: "https://example.com"
	},
})

const { data, error } = await vrchat.login({
	username: "", 
	password: "",
	twoFactorSecret: ""
	// twoFactorCode: () => TOTP.generate("").otp,
})

if (!data) throw new Error(`Couldn't login to VRChat: ${error}`);
console.log(`Logged in as ${data.displayName}!`);
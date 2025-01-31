const vrchat = require("vrchat");
const readline = require("readline")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));


const configuration = new vrchat.Configuration({
    username: "username",
    password: "password",
    baseOptions: {
        headers: { "User-Agent": "ExampleProgram/0.0.1 my@email.com"}
    }
});

const authenticationApi = new vrchat.AuthenticationApi(configuration);
const usersApi = new vrchat.UsersApi(configuration);
const systemApi = new vrchat.SystemApi(configuration);

async function main() {
    var currentUser = (await authenticationApi.getCurrentUser()).data;

    if (currentUser["requiresTwoFactorAuth"] && currentUser["requiresTwoFactorAuth"][0] === "emailOtp") {
        await authenticationApi.verify2FAEmailCode({ code: await prompt("email Code\n") })
        currentUser = (await authenticationApi.getCurrentUser()).data;
    }
    if (currentUser["requiresTwoFactorAuth"] && currentUser["requiresTwoFactorAuth"][0] === "totp") {
        await authenticationApi.verify2FA({ code: await prompt("2fa Code\n") })
        currentUser = (await authenticationApi.getCurrentUser()).data;
    }

    console.log(`Logged in as: ${currentUser.displayName}`);

    const currentOnlineUsers = (await systemApi.getCurrentOnlineUsers()).data;
    console.log(`Current Online Users: ${currentOnlineUsers}`);

    const tupperUser = (await usersApi.getUser("usr_c1644b5b-3ca4-45b4-97c6-a2a0de70d469")).data;
    console.log(tupperUser.displayName);
}

main();




export function logUser(message) {

    console.log("");
    console.log("=================================");
    console.log("USER");
    console.log(message);

}

export function logTool(name, args) {

    console.log("---------------------------------");
    console.log("TOOL");
    console.log(name);
    console.log(JSON.stringify(args, null, 2));

}

export function logToolResult(result) {

    console.log("---------------------------------");
    console.log("RESULT");
    console.log(JSON.stringify(result, null, 2));

}

export function logFinal(text) {

    console.log("---------------------------------");
    console.log("FINAL");
    console.log(text);
    console.log("=================================");
    console.log("");

}
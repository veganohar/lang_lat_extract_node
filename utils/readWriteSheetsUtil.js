import { getSheetsClient } from "./getSheetsUtil.js";

// Write Values to a sheet
export async function writeToSheet(range, values, sheetId) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values }, // 2D array: [[val1], [val2], ...]
    });
    return response.data;
}

export async function clearData(range, sheetId) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range
    });
    return response.data;
}

// Read Values from a sheet in Sequence
export async function readSheetinSequence(range, sheetId) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
    });
    const rows = response.data.values || [];
    return rows;
}

// Read Values from a sheet with different Columns of ranges 
export async function readSheetinRanges(ranges, sheetId) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges
    });

    const rows = response.data.valueRanges;
    return rows;
}

export async function deleteRow(spreadsheetId, sheetGid, rowNumber) {
    const sheets = await getSheetsClient();
    const request = {
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: sheetGid,     // 👈 gid from the tab’s URL
                            dimension: "ROWS",
                            startIndex: rowNumber - 1, // API is 0-based
                            endIndex: rowNumber,
                        },
                    },
                },
            ],
        },
    };
    const response = await sheets.spreadsheets.batchUpdate(request);
    return response.data;
}


export async function deleteRows(spreadsheetId, sheetGid, rowNumbers) {
    const sheets = await getSheetsClient();
    const requests = rowNumbers.map((rowNumber) => ({
        deleteDimension: {
            range: {
                sheetId: sheetGid,
                dimension: "ROWS",
                startIndex: rowNumber - 1, // API is 0-based
                endIndex: rowNumber,
            },
        },
    }));

    const response = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests }});
    return response.data;
}

// Update a specific row by row number (rowNumber starts from 1)
export async function updateRow(spreadsheetId, range, values) {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: [values] }, // 2D array
    });

    return response.data;
}

export async function updateSingleColumnMultipleRows(
    sheetName,
    spreadsheetId,
    columnLetter,      // e.g. "G"
    rowIds,        // [{ row: 3, value: 1 }, { row: 8, value: 0 }]
    statusValue
) {
    const sheets = await getSheetsClient();
    const data = rowIds.map((row) => ({
        range: `${sheetName}!${columnLetter}${Number(row)}`,
        values: [[statusValue]] // always 2D
    }));
    const response = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
            valueInputOption: "RAW",
            data: data
        }
    });
    return response.data;
}

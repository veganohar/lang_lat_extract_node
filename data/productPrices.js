export const PRODUCT_PRICES = Object.freeze({
    curd: 130,
    cheese: 250,
    butter: 200,
});

export const PRODUCT_CATALOG = Object.freeze([
    {
        id: -1,
        name: "Peanut Curd",
        shortName: "curd",
        sizes: {
            "1 KG": { mrp: PRODUCT_PRICES.curd, sellingPrice: PRODUCT_PRICES.curd },
            "4 KG": { mrp: PRODUCT_PRICES.curd * 4, sellingPrice: PRODUCT_PRICES.curd * 4 },
        },
    },
    {
        id: -2,
        name: "Cheese",
        shortName: "cheese",
        sizes: {
            "200gm": { mrp: PRODUCT_PRICES.cheese, sellingPrice: PRODUCT_PRICES.cheese },
        },
    },
    {
        id: -3,
        name: "Butter",
        shortName: "butter",
        sizes: {
            "200gm": { mrp: PRODUCT_PRICES.butter, sellingPrice: PRODUCT_PRICES.butter },
        },
    },
]);

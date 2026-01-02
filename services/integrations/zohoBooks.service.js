import axios from "axios";

export async function createZohoContact(account, zohoConfig) {
    const primaryAddress = account.getPrimaryAddress?.();

    const payload = {
        contact_name: account.customerName,
        company_name: account.customerName,
        contact_type: account.isSupplier ? "vendor" : "customer",
        billing_address: {
            address: primaryAddress?.streetAddress,
            city: primaryAddress?.city,
            country: primaryAddress?.country,
            zip: primaryAddress?.zipCode,
        },
    };

    // ONLY add VAT fields if REGISTERED
    if (account.vatGstDetails?.vatStatus === "REGISTERED") {
        payload.vat_treatment = "vat_registered";
        payload.vat_number = account.vatGstDetails.vatNumber;
    }


    const res = await axios.post(
        "https://www.zohoapis.com/books/v3/contacts",
        payload,
        {
            headers: {
                Authorization: `Zoho-oauthtoken ${zohoConfig.accessToken}`,
                "X-com-zoho-books-organizationid": zohoConfig.orgId,
            },
        }
    );

    return res.data.contact;
}



export async function createZohoItem(metalStock, zohoConfig) {
    console.log("Creating Zoho Item for Metal Stock:", metalStock.code);

    const payload = {
        name: metalStock.code,
        sku: metalStock.code,
        description: metalStock.description,
        product_type: "goods",
        unit: metalStock.MakingUnit || "grams",
        track_inventory: true,
        // inventory_account_id: zohoConfig.stockAccountId,
    };

    try {
        const res = await axios.post(
            "https://www.zohoapis.com/books/v3/items",
            payload,
            {
                headers: {
                    Authorization: `Zoho-oauthtoken ${zohoConfig.accessToken}`,
                    "X-com-zoho-books-organizationid": zohoConfig.orgId,
                },
            }
        );

        console.log("Zoho Item created:", res.data);
        return res.data.item;   // ✅ return INSIDE try
    } catch (error) {
        console.error(
            "Error creating Zoho Item:",
            error.response?.data || error.message
        );
        throw error; // ✅ bubble up for service-level handling
    }
}





export async function getInventoryAccountId(zohoConfig) {
    const res = await axios.get(
        "https://www.zohoapis.com/books/v3/chartofaccounts",
        {
            headers: {
                Authorization: `Zoho-oauthtoken ${zohoConfig.accessToken}`,
                "X-com-zoho-books-organizationid": zohoConfig.orgId,
            },
            params: {
                filter_by: "AccountType.Inventory",
            },
        }
    );

    const inventoryAccount = res.data.chartofaccounts?.[0];

    if (!inventoryAccount) {
        throw new Error("Inventory account not found in Zoho Books");
    }

    return inventoryAccount.account_id;
}


export async function createZohoBill({
    vendorId,
    billNumber,
    billDate,
    itemId,
    quantity,
    rate,
    zohoConfig,
}) {
    const payload = {
        vendor_id: vendorId,
        bill_number: billNumber,
        date: new Date(billDate).toISOString().split("T")[0], // ✅ FIX
        line_items: [
            {
                item_id: itemId,
                quantity: Number(quantity), // ✅ grams with decimals
                rate: Number(rate),
            },
        ],
        is_inclusive_tax: false,
    };

    const res = await axios.post(
        "https://www.zohoapis.com/books/v3/bills",
        payload,
        {
            headers: {
                Authorization: `Zoho-oauthtoken ${zohoConfig.accessToken}`,
                "X-com-zoho-books-organizationid": zohoConfig.orgId,
            },
        }
    );

    return res.data.bill;
}


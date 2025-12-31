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

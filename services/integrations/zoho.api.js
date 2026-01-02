import axios from "axios";

export async function fetchInventoryAccountId(zohoConfig) {
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

  const account = res.data.chartofaccounts?.[0];

  if (!account) {
    throw new Error("Inventory Asset account not found in Zoho Books");
  }

  return account.account_id;
}

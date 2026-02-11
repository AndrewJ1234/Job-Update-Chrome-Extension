export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get data from request
    const {
      position,
      company,
      industry,
      status,
      applied,
      interviewDate,
      applicationLink,
      note,
    } = req.body;

    // Validate required fields
    if (!position || !company) {
      return res
        .status(400)
        .json({ error: "Position and Company are required" });
    }

    console.log("Using DATA_SOURCE_ID:", process.env.DATA_SOURCE_ID);

    // Skip fetching database - use data_source_id directly
    const dataSourceId = process.env.DATA_SOURCE_ID;

    if (!dataSourceId) {
      return res.status(400).json({
        error: "DATA_SOURCE_ID environment variable is not set",
      });
    }

    console.log("Using dataSourceId:", dataSourceId);

    // Step 1: Verify the data source exists by fetching it
    const dataSourceResponse = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.NOTION_API_SECRET}`,
          "Notion-Version": "2025-09-03",
        },
      },
    );

    const databaseData = await dataSourceResponse.json();

    console.log(
      "Full data source response:",
      JSON.stringify(databaseData, null, 2),
    );

    if (!dataSourceResponse.ok) {
      console.error("Data source fetch failed:", databaseData);
      return res.status(dataSourceResponse.status).json({
        error:
          "Failed to fetch data source - check your DATA_SOURCE_ID in Vercel env vars",
        details: databaseData,
        hint: "Use the DATA_SOURCE_ID you copied from Notion's 'Manage data sources'",
      });
    }

    // Get the actual data source ID from the response (should match what we sent)
    const finalDataSourceId = databaseData.id;

    // Step 2: Create the page with the data_source_id
    const notionPayload = {
      parent: {
        type: "data_source_id",
        data_source_id: finalDataSourceId,
      },
      properties: {
        Position: {
          type: "title",
          title: [{ type: "text", text: { content: position } }],
        },
        Company: {
          type: "rich_text",
          rich_text: [{ type: "text", text: { content: company } }],
        },
        Industry: {
          type: "rich_text",
          rich_text: [{ type: "text", text: { content: industry || "" } }],
        },
        "Application Status": {
          type: "select",
          select: { name: status || "Applied" },
        },
        Applied: {
          type: "date",
          date: { start: applied || new Date().toISOString().split("T")[0] },
        },
      },
    };

    // Add optional fields
    if (interviewDate) {
      notionPayload.properties["Interview Date"] = {
        type: "date",
        date: { start: interviewDate },
      };
    }

    if (applicationLink) {
      notionPayload.properties["Application Link"] = {
        type: "url",
        url: applicationLink,
      };
    }

    if (note) {
      notionPayload.properties["Note"] = {
        type: "rich_text",
        rich_text: [{ type: "text", text: { content: note } }],
      };
    }

    // Call Notion API to create the page
    const notionResponse = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_SECRET}`,
        "Content-Type": "application/json",
        "Notion-Version": "2025-09-03",
      },
      body: JSON.stringify(notionPayload),
    });

    const notionData = await notionResponse.json();

    if (!notionResponse.ok) {
      console.error("Notion API Error:", notionData);
      return res.status(notionResponse.status).json({
        error: notionData.message || "Failed to add to Notion",
        details: notionData,
      });
    }

    // Success!
    return res.status(200).json({
      success: true,
      message: "Job application added to Notion",
      id: notionData.id,
    });
  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

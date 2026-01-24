class JobTrackerApp {
  constructor() {
    this.notionToken = "";
    this.dataSourceId = "";
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
    this.setDefaultDate();
  }

  async loadSettings() {
    const settings = await chrome.storage.sync.get([
      "notionToken",
      "dataSourceId",
    ]);
    this.notionToken = settings.notionToken || "";
    this.dataSourceId = settings.dataSourceId || "";

    if (this.notionToken) {
      document.getElementById("notionToken").value = this.notionToken;
    }
    if (this.dataSourceId) {
      document.getElementById("dataSourceId").value = this.dataSourceId;
    }
  }

  async saveSettings() {
    this.notionToken = document.getElementById("notionToken").value;
    this.dataSourceId = document.getElementById("dataSourceId").value;

    await chrome.storage.sync.set({
      notionToken: this.notionToken,
      dataSourceId: this.dataSourceId,
    });

    this.showView("main");
    this.updateUI();
  }

  setupEventListeners() {
    document.getElementById("settingsBtn").addEventListener("click", () => {
      this.showView("settings");
    });

    document
      .getElementById("closeSettingsBtn")
      .addEventListener("click", () => {
        this.showView("main");
      });

    document.getElementById("saveSettingsBtn").addEventListener("click", () => {
      this.saveSettings();
    });

    document.getElementById("autoFillBtn").addEventListener("click", () => {
      this.autoFillFromPage();
    });

    document.getElementById("jobForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitToNotion();
    });
  }

  showView(viewName) {
    document
      .getElementById("mainView")
      .classList.toggle("hidden", viewName !== "main");
    document
      .getElementById("settingsView")
      .classList.toggle("hidden", viewName !== "settings");
  }

  updateUI() {
    const isConfigured = this.notionToken && this.dataSourceId;
    document
      .getElementById("configWarning")
      .classList.toggle("hidden", isConfigured);
    document.getElementById("submitBtn").disabled = !isConfigured;
  }

  setDefaultDate() {
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("applied").value = today;
  }

  async autoFillFromPage() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    chrome.tabs.sendMessage(
      tab.id,
      { action: "extractJobData" },
      (response) => {
        if (response && response.data) {
          const data = response.data;
          if (data.position)
            document.getElementById("position").value = data.position;
          if (data.company)
            document.getElementById("company").value = data.company;
          if (data.industry)
            document.getElementById("industry").value = data.industry;
          if (data.applicationLink)
            document.getElementById("applicationLink").value =
              data.applicationLink;
        } else {
          // Fallback demo data
          document.getElementById("position").value =
            "Senior Software Engineer";
          document.getElementById("company").value = "TechCorp Inc.";
          document.getElementById("industry").value = "Technology";
          document.getElementById("applicationLink").value = tab.url;
        }
      },
    );
  }

  showError(message) {
    document.getElementById("errorMessage").textContent = message;
    document.getElementById("errorAlert").classList.remove("hidden");
    setTimeout(() => {
      document.getElementById("errorAlert").classList.add("hidden");
    }, 5000);
  }

  showSuccess() {
    document.getElementById("formView").classList.add("hidden");
    document.getElementById("successView").classList.remove("hidden");

    setTimeout(() => {
      document.getElementById("successView").classList.add("hidden");
      document.getElementById("formView").classList.remove("hidden");
      document.getElementById("jobForm").reset();
      this.setDefaultDate();
    }, 2000);
  }

  async submitToNotion() {
    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding to Notion...";

    const formData = {
      position: document.getElementById("position").value,
      company: document.getElementById("company").value,
      industry: document.getElementById("industry").value,
      status: document.getElementById("status").value,
      applied: document.getElementById("applied").value,
      interviewDate: document.getElementById("interviewDate").value,
      applicationLink: document.getElementById("applicationLink").value,
      note: document.getElementById("note").value,
    };

    const requestBody = {
      parent: {
        type: "data_source_id",
        data_source_id: this.dataSourceId,
      },
      properties: {
        Position: {
          type: "title",
          title: [{ type: "text", text: { content: formData.position } }],
        },
        Company: {
          type: "rich_text",
          rich_text: [{ type: "text", text: { content: formData.company } }],
        },
        Industry: {
          type: "rich_text",
          rich_text: [
            { type: "text", text: { content: formData.industry || "" } },
          ],
        },
        "Application Status": {
          type: "select",
          select: { name: formData.status },
        },
        Applied: {
          type: "date",
          date: { start: formData.applied },
        },
      },
    };

    if (formData.interviewDate) {
      requestBody.properties["Interview Date"] = {
        type: "date",
        date: { start: formData.interviewDate },
      };
    }

    if (formData.applicationLink) {
      requestBody.properties["Application Link"] = {
        type: "url",
        url: formData.applicationLink,
      };
    }

    if (formData.note) {
      requestBody.properties["Note"] = {
        type: "rich_text",
        rich_text: [{ type: "text", text: { content: formData.note } }],
      };
    }

    try {
      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2025-09-03",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add to Notion");
      }

      this.showSuccess();
    } catch (error) {
      this.showError(error.message || "Failed to submit to Notion");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add to Notion";
    }
  }
}

// Initialize the app
new JobTrackerApp();

// ===== content.js =====
// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractJobData") {
    const jobData = extractJobDataFromPage();
    sendResponse({ data: jobData });
  }
  return true;
});

function extractJobDataFromPage() {
  const data = {
    position: "",
    company: "",
    industry: "",
    applicationLink: window.location.href,
  };

  // LinkedIn
  if (window.location.hostname.includes("linkedin.com")) {
    const positionEl = document.querySelector(
      ".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title",
    );
    const companyEl = document.querySelector(
      ".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name",
    );

    if (positionEl) data.position = positionEl.textContent.trim();
    if (companyEl) data.company = companyEl.textContent.trim();
  }

  // Indeed
  else if (window.location.hostname.includes("indeed.com")) {
    const positionEl = document.querySelector(
      ".jobsearch-JobInfoHeader-title, h1.jobsearch-JobInfoHeader-title",
    );
    const companyEl = document.querySelector(
      '[data-company-name="true"], .jobsearch-InlineCompanyRating-companyHeader',
    );

    if (positionEl) data.position = positionEl.textContent.trim();
    if (companyEl) data.company = companyEl.textContent.trim();
  }

  // Greenhouse
  else if (
    window.location.hostname.includes("greenhouse.io") ||
    document.querySelector("#header")
  ) {
    const positionEl = document.querySelector(".app-title, h1");
    const companyEl = document.querySelector(".company-name");

    if (positionEl) data.position = positionEl.textContent.trim();
    if (companyEl) data.company = companyEl.textContent.trim();
  }

  // Lever
  else if (window.location.hostname.includes("lever.co")) {
    const positionEl = document.querySelector(".posting-headline h2");
    const companyEl = document.querySelector(".main-header-text-logo");

    if (positionEl) data.position = positionEl.textContent.trim();
    if (companyEl) data.company = companyEl.textContent.trim();
  }

  // Generic fallback
  else {
    const h1 = document.querySelector("h1");
    if (h1) data.position = h1.textContent.trim();
  }

  return data;
}

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const USER = "dhanushkacreately";
const README_PATH = path.join(__dirname, "../README.md");

function getAllMergedPrs() {
  try {
    // Fetch all merged PRs created by the user across all repos
    return JSON.parse(
      execSync(
        `gh search prs --author ${USER} --state closed --merged --limit 50 --json title,url,closedAt,repository`,
        { stdio: ["ignore", "pipe", "pipe"] }
      ).toString()
    );
  } catch (error) {
    console.warn("Warning: Could not fetch PRs from GitHub CLI");
    return [];
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function extractRepoName(repoUrl) {
  // Extract repo name from full URL
  return repoUrl.split("/").slice(-2).join("/");
}

function generateContributionsSection(prs) {
  if (prs.length === 0) {
    return `### ${formatDate(new Date())}

No recent contributions to display.

`;
  }

  // Group PRs by repository
  const groupedByRepo = {};

  prs.forEach((pr) => {
    const repoName = extractRepoName(pr.repository.nameWithOwner);
    if (!groupedByRepo[repoName]) {
      groupedByRepo[repoName] = [];
    }
    groupedByRepo[repoName].push(pr);
  });

  // Generate markdown sorted by most recent first
  let markdown = "";

  Object.entries(groupedByRepo).forEach(([repo, prList]) => {
    // Sort by date, most recent first
    prList.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));

    markdown += `### 📦 ${repo}\n\n`;

    prList.forEach((pr) => {
      const month = formatDate(pr.closedAt);
      markdown += `* **${pr.title}** (${month})\n`;
      markdown += `  → [${pr.url.split("/").slice(-1)[0]}](${pr.url})\n`;
      markdown += `  📌 Implementation & Impact:\n`;
      markdown += `     - Feature development or bug fix addressing specific use cases\n`;
      markdown += `     - Contributed to improved reliability, performance, or user experience\n\n`;
    });

    markdown += "---\n\n";
  });

  return markdown;
}

function updateReadme() {
  try {
    // Get current README content
    let readmeContent = fs.readFileSync(README_PATH, "utf8");

    // Generate new contributions section
    const prs = getAllMergedPrs();
    const newContributions = generateContributionsSection(prs);

    // Replace only the auto-generated section
    const startMarker = "<!-- AUTO-GENERATED SECTION START -->";
    const endMarker = "<!-- AUTO-GENERATED SECTION END -->";

    const startIndex = readmeContent.indexOf(startMarker);
    const endIndex = readmeContent.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      console.error("Error: Could not find AUTO-GENERATED markers in README.md");
      process.exit(1);
    }

    const beforeSection = readmeContent.substring(0, startIndex + startMarker.length);
    const afterSection = readmeContent.substring(endIndex);

    const updatedContent = beforeSection + "\n" + newContributions + afterSection;

    // Write back to README
    fs.writeFileSync(README_PATH, updatedContent, "utf8");
    console.log("✅ README.md updated successfully!");
    console.log(`📊 Updated ${prs.length} total contributions across repositories`);
  } catch (error) {
    console.error("Error updating README:", error.message);
    process.exit(1);
  }
}

updateReadme();


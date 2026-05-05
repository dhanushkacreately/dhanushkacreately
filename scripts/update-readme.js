const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const USER = "dhanushkacreately";
const README_PATH = path.join(__dirname, "../README.md");
const CONTRIBUTIONS_PATH = path.join(__dirname, "../CONTRIBUTIONS.md");

function getAllMergedPrs() {
  try {
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

function parseContributionsFile() {
  try {
    if (!fs.existsSync(CONTRIBUTIONS_PATH)) {
      console.warn("Warning: CONTRIBUTIONS.md not found");
      return {};
    }

    const content = fs.readFileSync(CONTRIBUTIONS_PATH, "utf8");
    const contributions = {};

    // Parse the markdown file to extract contribution details
    const repoSections = content.split(/^## /m).slice(1); // Skip header

    repoSections.forEach((section) => {
      const lines = section.split("\n");
      const repoName = lines[0].trim();
      contributions[repoName] = [];

      let currentContribution = null;
      let currentField = null;

      lines.slice(1).forEach((line) => {
        if (line.startsWith("### ")) {
          if (currentContribution) {
            contributions[repoName].push(currentContribution);
          }
          currentContribution = {
            title: line.replace("### ", "").trim(),
            pr: "",
            date: "",
            techStack: "",
            implementation: [],
            impact: [],
          };
          currentField = null;
        } else if (currentContribution) {
          if (line.startsWith("- **PR:**")) {
            currentContribution.pr = line.replace("- **PR:**", "").trim();
          } else if (line.startsWith("- **Date:**")) {
            currentContribution.date = line.replace("- **Date:**", "").trim();
          } else if (line.startsWith("- **Tech Stack:**")) {
            currentContribution.techStack = line.replace("- **Tech Stack:**", "").trim();
          } else if (line.startsWith("- **Implementation:**")) {
            currentField = "implementation";
          } else if (line.startsWith("- **Impact:**")) {
            currentField = "impact";
          } else if (line.startsWith("  -") && currentField) {
            currentContribution[currentField].push(line.replace("  - ", "").trim());
          }
        }
      });

      if (currentContribution) {
        contributions[repoName].push(currentContribution);
      }
    });

    return contributions;
  } catch (error) {
    console.warn("Warning: Could not parse CONTRIBUTIONS.md:", error.message);
    return {};
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function extractRepoName(repoUrl) {
  return repoUrl.split("/").slice(-2).join("/");
}

function generateContributionsSection(prs, contributions) {
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

  // Generate markdown
  let markdown = "";

  Object.entries(groupedByRepo).forEach(([repo, prList]) => {
    prList.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));

    markdown += `### 📦 ${repo}\n\n`;

    prList.forEach((pr) => {
      const month = formatDate(pr.closedAt);
      markdown += `* **${pr.title}** (${month})\n`;
      markdown += `  → [View PR](${pr.url})\n`;

      // Try to find matching contribution details
      let foundDetails = false;
      Object.entries(contributions).forEach(([contribRepo, contribList]) => {
        if (contribRepo.includes(repo.split("/")[1])) {
          contribList.forEach((contrib) => {
            if (
              contrib.title.toLowerCase().includes(pr.title.toLowerCase()) ||
              pr.title.toLowerCase().includes(contrib.title.toLowerCase())
            ) {
              markdown += `\n  📌 **Implementation & Impact:**\n`;
              markdown += `     - **Tech Stack:** ${contrib.techStack}\n`;

              if (contrib.implementation.length > 0) {
                markdown += `     - **What was implemented:**\n`;
                contrib.implementation.forEach((item) => {
                  markdown += `       • ${item}\n`;
                });
              }

              if (contrib.impact.length > 0) {
                markdown += `     - **Impact delivered:**\n`;
                contrib.impact.forEach((item) => {
                  markdown += `       • ${item}\n`;
                });
              }

              foundDetails = true;
            }
          });
        }
      });

      if (!foundDetails) {
        markdown += `\n  📌 **Implementation & Impact:**\n`;
        markdown += `     - Feature development or bug fix addressing specific use cases\n`;
        markdown += `     - Contributed to improved reliability, performance, or user experience\n`;
      }

      markdown += `\n`;
    });

    markdown += "---\n\n";
  });

  return markdown;
}

function updateReadme() {
  try {
    let readmeContent = fs.readFileSync(README_PATH, "utf8");
    const prs = getAllMergedPrs();
    const contributions = parseContributionsFile();
    const newContributions = generateContributionsSection(prs, contributions);

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

    fs.writeFileSync(README_PATH, updatedContent, "utf8");
    console.log("✅ README.md updated successfully!");
    console.log(`📊 Tracked ${prs.length} total contributions across repositories`);
  } catch (error) {
    console.error("Error updating README:", error.message);
    process.exit(1);
  }
}

updateReadme();


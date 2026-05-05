const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const USER = "dhanushkacreately";
const README_PATH = path.join(__dirname, "../README.md");
const CONTRIBUTIONS_PATH = path.join(__dirname, "../CONTRIBUTIONS.md");

function getAllRecentPrs() {
  try {
    return JSON.parse(
      execSync(
        `gh search prs --owner creately --author ${USER} --limit 100 --sort updated --order desc --json title,url,state,closedAt,repository,updatedAt`,
        { stdio: ["ignore", "pipe", "pipe"] }
      ).toString()
    );
  } catch (error) {
    console.warn("Warning: Could not fetch PRs from GitHub CLI");
    console.error(error.message);
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
          } else if (line.startsWith("- **Status:**")) {
            currentContribution.status = line.replace("- **Status:**", "").trim();
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

function getStatusIndicator(pr) {
  const state = pr.state.toUpperCase();
  if (state === "MERGED") return "✅ Merged";
  if (state === "OPEN") return "🟡 Open";
  if (state === "CLOSED") return "❌ Closed";
  return pr.state;
}

function generateContributionsSection(prs, contributions) {
  if (prs.length === 0) {
    return `### ${formatDate(new Date())}

No recent contributions to display.

`;
  }

  // Group PRs by repository and filter for 'creately' organization
  const groupedByRepo = {};

  prs.forEach((pr) => {
    const repoNameWithOwner = pr.repository.nameWithOwner;
    if (!repoNameWithOwner.startsWith("creately/")) return; // Only 'creately' org

    const repoName = extractRepoName(repoNameWithOwner);
    if (!groupedByRepo[repoName]) {
      groupedByRepo[repoName] = [];
    }
    groupedByRepo[repoName].push(pr);
  });

  // Generate markdown
  let markdown = "";

  const sortedRepos = Object.keys(groupedByRepo).sort();

  sortedRepos.forEach((repo) => {
    const prList = groupedByRepo[repo];
    prList.sort((a, b) => new Date(b.updatedAt || b.closedAt) - new Date(a.updatedAt || a.closedAt));

    markdown += `### 📦 ${repo}\n\n`;
    markdown += `| Date | Contribution | Status | Implementation & Impact |\n`;
    markdown += `| :--- | :--- | :--- | :--- |\n`;

    prList.forEach((pr) => {
      const date = pr.closedAt || pr.updatedAt;
      const month = formatDate(date);
      const status = getStatusIndicator(pr);
      const prLink = `[${pr.title}](${pr.url})`;

      // Try to find matching contribution details
      let implementationImpact = "";
      let foundDetails = false;
      Object.entries(contributions).forEach(([contribRepo, contribList]) => {
        if (contribRepo.includes(repo.split("/")[1])) {
          contribList.forEach((contrib) => {
            if (
              contrib.title.toLowerCase().includes(pr.title.toLowerCase()) ||
              pr.title.toLowerCase().includes(contrib.title.toLowerCase())
            ) {
              if (contrib.implementation.length > 0) {
                implementationImpact += `**Implementation:**<br>`;
                contrib.implementation.forEach((item) => {
                  implementationImpact += `• ${item}<br>`;
                });
              }

              if (contrib.impact.length > 0) {
                if (implementationImpact) implementationImpact += `<br>`;
                implementationImpact += `**Impact:**<br>`;
                contrib.impact.forEach((item) => {
                  implementationImpact += `• ${item}<br>`;
                });
              }

              foundDetails = true;
            }
          });
        }
      });

      if (!foundDetails) {
        implementationImpact = `• Feature development or bug fix addressing specific use cases<br>• Contributed to improved reliability, performance, or user experience`;
      }

      // Clean up trailing <br>
      implementationImpact = implementationImpact.replace(/(<br>)+$/, "");

      markdown += `| ${month} | ${prLink} | ${status} | ${implementationImpact} |\n`;
    });

    markdown += "\n---\n\n";
  });

  return markdown;
}

function updateReadme() {
  try {
    let readmeContent = fs.readFileSync(README_PATH, "utf8");
    const prs = getAllRecentPrs();
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


const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const USER = "dhanushkacreately";
const README_PATH = path.join(__dirname, "../README.md");
const CONTRIBUTIONS_PATH = path.join(__dirname, "../CONTRIBUTIONS.md");

function getTotalCommits() {
  try {
    const output = execSync(
      `gh search commits org:creately author:${USER} --limit 1000 --json oid`,
      { stdio: ["ignore", "pipe", "pipe"] }
    ).toString();
    return JSON.parse(output).length;
  } catch (error) {
    console.warn("Warning: Could not fetch commit count:", error.message);
    return 0;
  }
}

function formatCommandFailure(error, context) {
  const stderr = error.stderr ? error.stderr.toString().trim() : "";
  const stdout = error.stdout ? error.stdout.toString().trim() : "";
  const details = stderr || stdout || error.message;

  return new Error(`${context}: ${details}`);
}

function getAllRecentPrs() {
  try {
    const output = execSync(
      `gh search prs --owner creately --author ${USER} --limit 1000 --sort updated --order desc --json title,url,number,state,closedAt,createdAt,repository,updatedAt`,
      { stdio: ["ignore", "pipe", "pipe"] }
    ).toString();

    return JSON.parse(output);
  } catch (error) {
    throw formatCommandFailure(error, "GitHub PR search failed");
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

function fetchPrDetails(prUrl) {
  try {
    const output = execSync(
      `gh pr view ${prUrl} --json title,body,labels,files,commits,state`,
      { stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }
    ).toString();
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function generateImplementationImpact(prDetails, prTitle) {
  if (!prDetails) {
    return { implementation: "Bug fix / feature", impact: "Reliability & UX" };
  }

  const labels = prDetails.labels.map((l) => l.name.toLowerCase());
  const files = prDetails.files.map((f) => f.path);
  const commits = prDetails.commits || [];

  const isFeature =
    labels.some((l) => /^(feat|feature)$/.test(l)) || /^feat/i.test(prTitle);
  const isFix =
    labels.some((l) => /^(fix|bug)$/.test(l)) || /^fix/i.test(prTitle);
  const isChore =
    labels.some((l) => /^chore$/.test(l)) || /^chore/i.test(prTitle);

  const area = files
    .map((f) => {
      const parts = f.split("/");
      if (parts[0] === "src" && parts[1]) return parts[1];
      if (parts[0] !== "node_modules" && parts[0] !== ".github" && parts[0] !== ".yarn" && !parts[0].startsWith(".")) return parts[0];
      return null;
    })
    .find(Boolean) || "";

  const commitMsg = commits
    .map((c) => c.messageHeadline)
    .filter(Boolean)
    .map((msg) => msg.replace(/^(feat|fix|chore|refactor|docs|style|test|perf|build|ci)(\(.*?\))?:\s*/i, ""))
    .find((msg) => msg.length > 5);

  let implementation;
  let impact;

  if (commitMsg) {
    implementation = commitMsg.charAt(0).toUpperCase() + commitMsg.slice(1);
  } else if (isFeature) {
    implementation = prTitle.replace(/^feat(\(.*?\))?:\s*/i, "").trim();
  } else if (isFix) {
    implementation = prTitle.replace(/^fix(\(.*?\))?:\s*/i, "").trim();
  } else {
    implementation = prTitle;
  }

  if (implementation.length > 45) implementation = implementation.slice(0, 42) + "…";

  if (isFeature) impact = "New capability";
  else if (isFix) impact = "Reliability";
  else if (isChore) impact = "Maintenance";
  else impact = "Reliability & UX";

  if (area) impact += ` (${area})`;

  return { implementation, impact };
}

function formatContributionEntry(title, prUrl, date, status, implementation, impact) {
  let entry = `\n### ${title}\n`;
  entry += `- **PR:** ${prUrl}\n`;
  entry += `- **Date:** ${date}\n`;
  entry += `- **Status:** ${status}\n`;
  entry += `- **Implementation:**\n`;
  implementation.forEach((i) => (entry += `  - ${i}\n`));
  entry += `- **Impact:**\n`;
  impact.forEach((i) => (entry += `  - ${i}\n`));
  return entry;
}

function ensureContributionInFile(
  repoName,
  title,
  prUrl,
  date,
  status,
  implementation,
  impact
) {
  if (!fs.existsSync(CONTRIBUTIONS_PATH)) {
    let content = `# Contributions & Impact Registry\n\nThis file tracks implementation details and impact of all PRs. Updated automatically in README.md daily.\n\n## ${repoName}\n\n`;
    content += formatContributionEntry(
      title,
      prUrl,
      date,
      status,
      implementation,
      impact
    );
    fs.writeFileSync(CONTRIBUTIONS_PATH, content, "utf8");
    return;
  }

  let content = fs.readFileSync(CONTRIBUTIONS_PATH, "utf8");
  if (content.includes(prUrl)) return;

  const repoHeader = `## ${repoName}`;
  const entry = formatContributionEntry(
    title,
    prUrl,
    date,
    status,
    implementation,
    impact
  );

  const repoIndex = content.indexOf(repoHeader);
  if (repoIndex === -1) {
    content += `\n${repoHeader}\n${entry}\n`;
  } else {
    const afterHeader = content.indexOf("\n", repoIndex) + 1;
    const nextSection = content.indexOf("\n## ", afterHeader);
    if (nextSection === -1) {
      content = content.trimEnd() + "\n" + entry + "\n";
    } else {
      content =
        content.slice(0, nextSection) + entry + "\n" + content.slice(nextSection);
    }
  }

  fs.writeFileSync(CONTRIBUTIONS_PATH, content, "utf8");
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
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
    const hasContributionRegistry = Object.keys(contributions).length > 0;
    const emptyMessage = hasContributionRegistry
      ? "No live PRs were returned by GitHub search. This usually means the workflow token does not have access to all repositories."
      : "No recent contributions to display.";

    return `### ${formatDate(new Date())}

${emptyMessage}

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

  // Calculate metrics
  const metrics = {
    total: prs.length,
    merged: prs.filter(pr => pr.state.toUpperCase() === "MERGED").length,
    open: prs.filter(pr => pr.state.toUpperCase() === "OPEN").length,
    closed: prs.filter(pr => pr.state.toUpperCase() === "CLOSED").length,
    commits: getTotalCommits()
  };

  markdown += `<table>\n<tr><th>📊 Total PRs</th><th>✅ Merged</th><th>🟡 Open</th><th>❌ Closed</th><th>💻 Total Commits</th></tr>\n`;
  markdown += `<tr><td>${metrics.total}</td><td>${metrics.merged}</td><td>${metrics.open}</td><td>${metrics.closed}</td><td>${metrics.commits}</td></tr>\n`;
  markdown += `</table>\n\n`;

  const sortedRepos = Object.keys(groupedByRepo).sort();

  sortedRepos.forEach((repo) => {
    const prList = groupedByRepo[repo];
    prList.sort((a, b) => new Date(b.updatedAt || b.closedAt) - new Date(a.updatedAt || a.closedAt));

    markdown += `### 📦 ${repo}\n\n`;
    markdown += `<table>\n`;
    markdown += `<colgroup><col width="12%"><col width="38%"><col width="10%"><col width="22%"><col width="18%"></colgroup>\n`;
    markdown += `<tr><th>Date</th><th>Contribution</th><th>Status</th><th>Implementation</th><th>Impact</th></tr>\n`;

    prList.forEach((pr) => {
      const date = pr.createdAt;
      const month = formatDate(date);
      const status = getStatusIndicator(pr);
      const prLink = `<a href="${pr.url}">${pr.title} - ${pr.number}</a>`;

      // Try to find matching contribution details
      let implementation = "";
      let impact = "";
      let foundDetails = false;
      Object.entries(contributions).forEach(([contribRepo, contribList]) => {
        if (contribRepo.includes(repo.split("/")[1])) {
          contribList.forEach((contrib) => {
            if (
              pr.url.includes(contrib.pr) ||
              contrib.pr.includes(pr.url)
            ) {
              if (contrib.implementation.length > 0) {
                implementation = `• ${contrib.implementation[0]}`;
              }

              if (contrib.impact.length > 0) {
                impact = `• ${contrib.impact[0]}`;
              }

              foundDetails = true;
            }
          });
        }
      });

      if (!foundDetails) {
        const prDetails = fetchPrDetails(pr.url);
        const generated = generateImplementationImpact(prDetails, pr.title);

        implementation = `• ${generated.implementation}`;
        impact = `• ${generated.impact}`;

        try {
          ensureContributionInFile(
            extractRepoName(pr.repository.nameWithOwner),
            pr.title,
            pr.url,
            formatDate(pr.createdAt),
            getStatusIndicator(pr),
            [generated.implementation],
            [generated.impact]
          );
        } catch (err) {
          console.warn(`Warning: Could not persist entry for "${pr.title}": ${err.message}`);
        }
      }

      markdown += `<tr><td>${month}</td><td>${prLink}</td><td>${status}</td><td>${implementation}</td><td>${impact}</td></tr>\n`;
    });

    markdown += "</table>\n\n---\n\n";
  });

  return markdown;
}

function updateReadme() {
  try {
    let readmeContent = fs.readFileSync(README_PATH, "utf8");
    const prs = getAllRecentPrs();
    if (prs.length === 0) {
      throw new Error(
        "No PRs returned from GitHub search for owner=creately and author=dhanushkacreately. This usually means the token does not have access to the Creately repositories, the token is not SSO-authorized for the Creately org, or the author filter does not match the PR author login. Refusing to overwrite README with an empty contributions section."
      );
    }
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

 
// Worrking on manifest v3 - remember
 

// Built-in platform map (aliases + optional search URL) pre-loaded for user to use.
const platformMap = {
  "youtube": { aliases: ["yt", "watch", "video", "videos", "vlog", "tutorials"], url: "https://www.youtube.com", search: "https://www.youtube.com/results?search_query=" },
  "linkedin": { aliases: ["li", "job", "career", "professional", "profile", "resume"], url: "https://www.linkedin.com", search: "https://www.linkedin.com/search/results/all/?keywords=" },
  "github": { aliases: ["gh", "code", "repo", "git", "repository"], url: "https://github.com", search: "https://github.com/search?q=" },
  "x": { aliases: ["twitter", "tw", "tweet", "tweets", "post"], url: "https://x.com", search: "https://x.com/search?q=" },
  "chatgpt": { aliases: ["gpt", "openai", "askgpt"], url: "https://chatgpt.com", search: "https://chatgpt.com/?q=" },
  "gemini": { aliases: ["googleai", "bard"], url: "https://gemini.google.com/app", search: "https://gemini.google.com/app" },
  "grok": { aliases: ["xai"], url: "https://grok.com", search: "https://grok.com/" },
  "reddit": { aliases: ["sub", "subreddit", "thread"], url: "https://www.reddit.com", search: "https://www.reddit.com/search/?q=" },
  "replit": { aliases: ["repl", "ide", "workspace"], url: "https://replit.com", search: "https://replit.com/search?q=" },
  "gmail": { aliases: ["mail", "workmail"], url: "https://mail.google.com/" },
  "instagram": { aliases: ["insta", "ig", "reels"], url: "https://instagram.com", search: "https://www.instagram.com/explore/search/keyword/?q=" },
  "facebook": { aliases: ["fb"], url: "https://facebook.com" },
  "whatsapp": { aliases: ["wa"], url: "https://web.whatsapp.com" },
  "spotify": { aliases: ["music", "songs"], url: "https://open.spotify.com", search: "https://open.spotify.com/search/" },
  "netflix": { aliases: ["movies", "shows"], url: "https://netflix.com" },
  "calendar": { aliases: ["cal", "schedule", "agenda"], url: "https://calendar.google.com" },
  "drive": { aliases: ["gdrive", "docs", "files"], url: "https://drive.google.com" }
};

// Default routines — one keyword opens many tabs at once.
// Fully editable/creatable from the popup; this is only the seed data
// written to storage the first time the extension runs.
const defaultRoutines = {
  "morning": {
    label: "Morning Routine",
    urls: [
      "https://mail.google.com",
      "https://calendar.google.com",
      "https://news.google.com"
    ]
  }
};

// Conversational clutter to strip out of a query
const actionPhrases = [
  "search for", "search", "look up", "find the profile of", "find profile of",
  "find info on", "find out about", "find", "connect with", "connect",
  "watch a tutorial on", "watch a video on", "watch", "ask to", "ask",
  "tell me about", "tell me", "show me", "open up", "open", "go to",
  "how to", "write code for"
];

const connectorPhrases = ["and", "about", "on", "in", "at", "for", "with", "to", "of"];

const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

 
// FUZZY MATCHING — lets "gitub", "yutube", "linkdin" etc. still resolve
 

// Classic Levenshtein edit distance (insert/delete/substitute cost 1)
function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array(n + 1);
  let curRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    curRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        curRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    [prevRow, curRow] = [curRow, prevRow];
  }
  return prevRow[n];
}

// How many typos we tolerate scales with word length, so short words
// like "x" or "gh" don't accidentally swallow unrelated input.
function typoBudget(triggerLength) {
  if (triggerLength <= 3) return 0; // exact only — too risky otherwise
  if (triggerLength <= 5) return 1;
  if (triggerLength <= 8) return 2;
  return 3;
}

// Finds the best fuzzy match for a single word against a list of
// {platformKey, config, trigger} entries. Returns null if nothing is
// close enough.

function bestFuzzyMatch(word, triggerEntries) {
  if (!word || word.length < 3) return null;
  let best = null;

  for (const entry of triggerEntries) {
    const budget = typoBudget(entry.trigger.length);
    if (budget === 0) continue; // exact matches already handled earlier
    // Quick length pre-filter avoids wasted distance computation
    if (Math.abs(entry.trigger.length - word.length) > budget) continue;

    const distance = levenshtein(word, entry.trigger);
    if (distance <= budget && (!best || distance < best.distance)) {
      best = { ...entry, distance, matchedWord: word };
    }
  }
  return best;
}

function buildTriggerEntries(allPlatforms) {
  const entries = [];
  for (const [key, config] of Object.entries(allPlatforms)) {
    const triggers = [key, ...(config.aliases || [])];
    for (const trigger of triggers) {
      entries.push({ platformKey: key, config, trigger: trigger.toLowerCase() });
    }
  }
  return entries;
}

 
// THE INTELLIGENT PART - Auto detects wheather a spell mistake or erros in the name. [PLEASE WORK]
 

function ruleBasedParser(inputText, customShortcuts = {}) {
  let cleanedText = inputText.trim();
  if (!cleanedText) return { target: null, query: "", corrected: null };

  const allPlatforms = { ...platformMap, ...customShortcuts };
  const triggerEntries = buildTriggerEntries(allPlatforms);

  let matchedPlatformKey = null;
  let matchedConfig = null;
  let detectedAlias = "";
  let correctedFrom = null; // set when a typo was auto-corrected

  // PASS 1a: Exact word-boundary match
  outer:
  for (const entry of triggerEntries) {
    const regex = new RegExp(`\\b${escapeRegex(entry.trigger)}\\b`, 'i');
    if (regex.test(cleanedText)) {
      matchedPlatformKey = entry.platformKey;
      matchedConfig = entry.config;
      detectedAlias = entry.trigger;
      break outer;
    }
  }

  // PASS 1b: Typo-tolerant fallback — scan each word in the input for a
  // close-enough match against every known platform trigger/alias.

  if (!matchedPlatformKey) {
    const words = cleanedText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    let best = null;
    for (const word of words) {
      const candidate = bestFuzzyMatch(word, triggerEntries);
      if (candidate && (!best || candidate.distance < best.distance)) {
        best = candidate;
      }
    }
    if (best) {
      matchedPlatformKey = best.platformKey;
      matchedConfig = best.config;
      detectedAlias = best.matchedWord; // remove the typo'd word itself
      correctedFrom = { typed: best.matchedWord, resolvedTo: best.platformKey };
    }
  }

  // Normal search on google if nothing is found related to the content.

  if (!matchedPlatformKey) {
    return {
      target: { url: "https://www.google.com", search: "https://www.google.com/search?q=" },
      query: cleanedText,
      corrected: null
    };
  }

  // PASS 2a: Erase the matched platform identifier (or the typo'd word) safely
  const platformRegex = new RegExp(`\\b${escapeRegex(detectedAlias)}\\b`, 'gi');
  cleanedText = cleanedText.replace(platformRegex, '');

  // PASS 2b: Mop up any "other" reference to the same platform still sitting
  // in the text — e.g. a generic alias matched first ("profile") while a
  // typo of the platform name ("linkdin") is still elsewhere in the
  // sentence. Without this, that stray word leaks into the search query.
  const sameplatformTriggers = triggerEntries.filter(e => e.platformKey === matchedPlatformKey);
  cleanedText = cleanedText
    .split(/\s+/)
    .filter((word) => {
      if (!word) return false;
      const lower = word.toLowerCase();
      // Already removed this exact word above (it was the detected alias)
      if (lower === detectedAlias.toLowerCase()) return false;
      const fuzzy = bestFuzzyMatch(lower, sameplatformTriggers);
      // Only drop it if it's a genuine typo (distance > 0) of this platform's
      // own name/alias — exact alias words (e.g. "video", "profile") are left
      // alone here since they may be ordinary English handled elsewhere.
      return !(fuzzy && fuzzy.distance > 0);
    })
    .join(' ');

  // PASS 3a: Clear heavy action phrases ("search for", "look up"...) front/back
  actionPhrases.forEach(phrase => {
    const frontRegex = new RegExp(`^\\s*${phrase}\\b`, 'gi');
    const backRegex = new RegExp(`\\b${phrase}\\s*$`, 'gi');
    cleanedText = cleanedText.replace(frontRegex, '').replace(backRegex, '');
  });

  // PASS 4: Clear residual connective tissue on the boundaries
  let loops = 3;
  while (loops > 0) {
    connectorPhrases.forEach(connector => {
      cleanedText = cleanedText.replace(new RegExp(`^\\s*${connector}\\b`, 'gi'), '');
      cleanedText = cleanedText.replace(new RegExp(`\\b${connector}\\s*$`, 'gi'), '');
    });
    loops--;
  }

  // PASS 5: Final sanitize
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

  // Don't send an empty/symbol-only search query
  if (/^[^a-zA-Z0-9]*$/.test(cleanedText)) {
    cleanedText = "";
  }

  return { target: matchedConfig, query: cleanedText, corrected: correctedFrom };
}

 
// Routines - Section to configure routines such as "morning", "chill", etc.
 

function matchRoutine(inputText, routines) {
  const trimmed = inputText.trim().toLowerCase();
  if (!trimmed) return null;

  const names = Object.keys(routines);
  if (names.length === 0) return null;

  // Exact match on the whole phrase, or on its first word
  const firstWord = trimmed.split(/\s+/)[0];
  for (const name of names) {
    if (trimmed === name || firstWord === name) {
      return { name, routine: routines[name], corrected: null };
    }
  }

  // Typo-tolerant match (only worth it for single/short inputs, so a
  // normal multi-word platform query doesn't accidentally trip a routine)
  // Will be fixing this later.... [FIX]

  if (trimmed.split(/\s+/).length <= 2) {
    let best = null;
    for (const name of names) {
      const budget = typoBudget(name.length);
      if (budget === 0) continue;
      const distance = levenshtein(firstWord, name);
      if (distance <= budget && (!best || distance < best.distance)) {
        best = { name, routine: routines[name], distance };
      }
    }
    if (best) {
      return { name: best.name, routine: best.routine, corrected: { typed: firstWord, resolvedTo: best.name } };
    }
  }

  return null;
}

function getStoredData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["customShortcuts", "routines"], (data) => {
      resolve({
        customShortcuts: data.customShortcuts || {},
        routines: data.routines || defaultRoutines
      });
    });
  });
}

// Seed default routines once, on first install, without clobbering
// anything a user may already have customized.

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["routines"], (data) => {
    if (!data.routines) {
      chrome.storage.local.set({ routines: defaultRoutines });
    }
  });
});


// Chrome Omnibox event handlers - combines address bar and search bar and searches for stuff.


chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const trimmed = text.trim();
  if (!trimmed) {
    chrome.omnibox.setDefaultSuggestion({ description: "Type instructions naturally, or a routine name like 'morning'..." });
    return;
  }

  getStoredData().then(({ customShortcuts, routines }) => {
    const routineHit = matchRoutine(trimmed, routines);
    if (routineHit) {
      const count = routineHit.routine.urls.length;
      const correctionNote = routineHit.corrected ? ` (matched from "${routineHit.corrected.typed}")` : "";
      chrome.omnibox.setDefaultSuggestion({
        description: `QuickNav Routine -> Open "${routineHit.name}"${correctionNote}: ${count} tab${count === 1 ? '' : 's'}`
      });
      return;
    }

    const result = ruleBasedParser(trimmed, customShortcuts);
    const correctionNote = result.corrected ? ` (typo-corrected "${result.corrected.typed}" -> ${result.corrected.resolvedTo})` : "";

    if (result.query) {
      chrome.omnibox.setDefaultSuggestion({
        description: `Smart Parser${correctionNote} -> Search query extracted: <match>${result.query}</match>`
      });
    } else {
      chrome.omnibox.setDefaultSuggestion({
        description: `Smart Parser${correctionNote} -> Navigating directly to homepage.`
      });
    }
  });
});

chrome.omnibox.onInputEntered.addListener((text) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  getStoredData().then(({ customShortcuts, routines }) => {
    const routineHit = matchRoutine(trimmed, routines);
    if (routineHit) {
      const urls = routineHit.routine.urls.filter(Boolean);
      if (urls.length === 0) return;
      // First tab replaces the current one, the rest open alongside it
      chrome.tabs.update({ url: urls[0] });
      for (let i = 1; i < urls.length; i++) {
        chrome.tabs.create({ url: urls[i], active: false });
      }
      return;
    }

    const result = ruleBasedParser(trimmed, customShortcuts);
    if (!result.target) return;

    let destinationUrl = "";
    if (result.query && result.target.search) {
      destinationUrl = result.target.search + encodeURIComponent(result.query);
    } else {
      destinationUrl = result.target.url;
    }

    chrome.tabs.update({ url: destinationUrl });
  });
});

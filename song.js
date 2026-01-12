console.log("RUNNING LATEST JS FILE - VERSION 5");

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const lyricsContainer = $('lyrics-container');
const lyricsViewport = $('lyricsDisplay');
const SETTINGS_KEY = 'teleprompterSettings';
let allHymnsData = {};
let lines = [];
let initialHymnLines = [];
let currentIndex = 0;
let currentHymnNumber = null;
let usingCustomLyrics = false;
let customLyricsStore = {}; 
let currentView = 'hymn';
let audio = null;
let mainTimer = null;
let introTimeout = null;
let isPlaying = false;
let availableLanguages = [];
let selectedLanguages = [];
let languageOrder = [];
let activeColorInput = null;
let runlistNumbers = [];
let currentRunlistIndex = 0;
let currentSpeed = 0; // Default 0 means "Standard Speed"
let playbackRate = 1.0;
let sessionSpeedStore = {};
let currentLineTimings = [];
let lineStartTimestamp = 0;
let hasPausedForCurrentVerse = false;
// Add these with your other let variables
let currentVerseMap = []; // Stores start/end index and duration for each verse
let skippedVerseLabels = []; // Stores ["1:", "2:"] etc.
 


const JEWEL_TONES = [
    '#bb0728', '#730953', '#301734', '#c32d4e', '#bc0788', '#ff36e6',
    '#c7075a', '#790027', '#953659', '#feba3a', '#c8912f', '#ffe0af',
    '#d9b056', '#967d2a', '#2d3f25', '#be3a09', '#1e311b', '#3f692f',
    '#c4720c', '#096c2b', '#0a5843', '#08ba98', '#355983', '#2c4294',
    '#057d8d', '#287796', '#442897', '#0e1a54', '#143281', '#0d0b18',
    '#f4ffff', '#bea0ae', '#82bbe0', '#8de6ed', '#fce6e1', '#d5d7d0'
];
const DEFAULTS = {
  bgColor: '#ffffff',
  highlightColor: '#2c4294',
  underlineColor: '#f4ffff',
  dotColor: '#82bbe0',
  showDots: true,
  showUnderline: true,
  showProgressBar: true,
  transitionSpeed: '0.5',
  lyricsWidth: '700',
  languages: {
    English: { fontSize: '3', fontColorActive: '#ffffff', fontColorInactive: '#4b5563' },
    Spanish: { fontSize: '3', fontColorActive: '#1e88e5', fontColorInactive: '#8ab4f8' },
    ASL: { fontSize: '3', fontColorActive: '#d5d7d0', fontColorInactive: '#287796' },
    Custom: { fontSize: '3', fontColorActive: '#ffe0af', fontColorInactive: '#953659' }
  }
};

function saveSettings() {
  // 1. Get values from the currently visible form inputs
  const currentFormSettings = getSettingsFromForm();
  
  // 2. Load existing storage to preserve data for things NOT currently on screen
  let savedSettings = {};
  try {
    savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (e) { }

  // 3. Merge Global Settings (These inputs always exist, so we trust the form)
  savedSettings.bgColor = currentFormSettings.bgColor;
  savedSettings.highlightColor = currentFormSettings.highlightColor;
  savedSettings.underlineColor = currentFormSettings.underlineColor;
  savedSettings.dotColor = currentFormSettings.dotColor;
  savedSettings.showDots = currentFormSettings.showDots;
  savedSettings.showUnderline = currentFormSettings.showUnderline;
  savedSettings.showProgressBar = currentFormSettings.showProgressBar;
  savedSettings.transitionSpeed = currentFormSettings.transitionSpeed;
  savedSettings.lyricsWidth = currentFormSettings.lyricsWidth;

  // 4. Merge Language Settings Smartly
  savedSettings.languages = savedSettings.languages || {};
  
  languageOrder.forEach(lang => {
    // Check if the input for this language actually exists in the DOM right now
    if (document.getElementById(`fontSize-${lang}`)) {
        // CASE A: The inputs exist. The user might have changed them. Save the Form value.
        savedSettings.languages[lang] = currentFormSettings.languages[lang];
    } 
    else if (!savedSettings.languages[lang]) {
         // CASE B: Brand New Language (e.g., just added Custom) AND no saved data yet.
         // FIX: Do NOT use defaults. Inherit settings from the main language (e.g., English)
         // so it matches the user's current theme.
         
         const refLang = languageOrder.find(l => l !== lang && savedSettings.languages[l]) || 'English';
         const refSettings = savedSettings.languages[refLang] || DEFAULTS.languages.English;
         
         // Clone the reference settings (e.g., make Custom look like English)
         savedSettings.languages[lang] = { ...refSettings };
    }
    // CASE C: Input doesn't exist, but we already have saved data. 
    // Do nothing (keep the saved data), so we don't accidentally overwrite it.
  });

  // 5. Save Arrays
  savedSettings.languageOrder = [...languageOrder];
  savedSettings.selectedLanguages = [...selectedLanguages];
  savedSettings.customLyricsStore = customLyricsStore;

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(savedSettings));
}

// song.js (Around line 47)
function loadSettings() {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            
            // --- CRITICAL FIX: LOAD THE CUSTOM LYRICS STORE ---
            if (settings.customLyricsStore) {
                Object.assign(customLyricsStore, settings.customLyricsStore);
                console.log("Custom lyrics loaded from storage:", customLyricsStore);
            }
            // --- END CRITICAL FIX ---
            
            return settings;

        } catch (e) {
            console.error("Error parsing saved settings:", e);
            localStorage.removeItem(SETTINGS_KEY);
            return null;
        }
    }
    return null;
}

function updateFormFromSettings(settings) {
  if (!settings) return;

  // Global settings
  $('bgColor').value = settings.bgColor || DEFAULTS.bgColor;
  $('highlightColor').value = settings.highlightColor || DEFAULTS.highlightColor;
  $('underlineColor').value = settings.underlineColor || DEFAULTS.underlineColor;
  $('dotColor').value = settings.dotColor || DEFAULTS.dotColor;
  $('transitionSpeed').value = settings.transitionSpeed || DEFAULTS.transitionSpeed;
  $('lyricsWidth').value = settings.lyricsWidth || DEFAULTS.lyricsWidth;
  
  if ($('skipIntro')) {
      $('skipIntro').checked = settings.skipIntro === true;
  }

  const showDots = settings.showDots !== false;
  const showUnderline = settings.showUnderline !== false;
  
  $('toggleUnderlineLabel').classList.toggle('disabled', !showUnderline);

  // Language-specific colors & sizes
  languageOrder.forEach(lang => {
    const langSettings = settings.languages?.[lang] || DEFAULTS.languages[lang] || DEFAULTS.languages.English;
    const activeInput = $(`fontColor-active-${lang}`);
    const inactiveInput = $(`fontColor-inactive-${lang}`);
    const sizeInput = $(`fontSize-${lang}`);

    if (activeInput) activeInput.value = langSettings.fontColorActive;
    if (inactiveInput) inactiveInput.value = langSettings.fontColorInactive;
    if (sizeInput) sizeInput.value = parseFloat(langSettings.fontSize || '3').toFixed(1);

    // Update the color display bars
    updateColorDisplay(`fontColor-active-${lang}`);
    updateColorDisplay(`fontColor-inactive-${lang}`);
  });
  
  updateColorDisplay('bgColor');
  updateColorDisplay('highlightColor');
  updateColorDisplay('underlineColor');
  updateColorDisplay('dotColor');

  console.log("Form updated from saved settings");
}

function initializeColorPalette() {
	const paletteContainer = $('jewel-tone-palette');
    JEWEL_TONES.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        paletteContainer.appendChild(swatch);
    });
    // All conflicting listeners removed.
    // The new listener at the end of the file handles this.
}

document.addEventListener('keydown', (event) => {
  const isTyping = ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
  
  // 1. Prevent Spacebar scrolling (unless typing)
  if (event.code === 'Space' && !isTyping) {
    event.preventDefault();
  }

  // 2. F2 Key: Toggle Play / Stop
  if (event.code === 'F2') {
    event.preventDefault(); // Prevent default browser actions
    
    if (isPlaying) {
        stopHymn(); // Stop and reset to the beginning
    } else {
        playHymn(); // Start from the beginning
    }
  }
});

function handleArrowKeys(event) {
  // Check if manual override is active and we are in a "playing" state (manual or automatic)
  if ($('manualControlOverride').checked && isPlaying) {
    if (event.keyCode === 40) { // Down Arrow
      event.preventDefault(); // Prevent page scrolling
      const currentLyricsLength = (usingCustomLyrics ? lines : initialHymnLines).length;
      if (currentIndex < currentLyricsLength - 1) {
        console.log("Manual Down Arrow: Advancing index");
        setCurrentIndex(currentIndex + 1);
      } else {
        console.log("Manual Down Arrow: Already at last line");
      }
    } else if (event.keyCode === 38) { // Up Arrow
      event.preventDefault(); // Prevent page scrolling
      if (currentIndex > 0) {
        console.log("Manual Up Arrow: Decreasing index");
        setCurrentIndex(currentIndex - 1);
      } else {
        console.log("Manual Up Arrow: Already at first line");
      }
    }
  }
}

function toggleManualControl() {
  const manualCheckbox = $('manualControlOverride');
  const isManual = manualCheckbox.checked;

  $('metaSPL').style.display = isManual ? 'none' : 'inline-block';
  lyricsViewport.classList.toggle('manual-active', isManual);

	$('metaSPL').style.display = isManual ? 'none' : 'inline-block';
  lyricsViewport.classList.toggle('manual-active', isManual);

  // 1. Get current settings (reads the current state of buttons)
  const settings = getSettingsFromForm();
  
  // 2. FORCE the dots setting based on Manual Mode
  // If Manual is TRUE, showDots becomes FALSE.
  settings.showDots = !isManual; 

  // 3. Apply changes visually (this adds the .dots-hidden class)
  applySettings(settings);
  
  // 4. Save (so it persists if we navigate)
  saveSettings();
  
  // 5. Update the visual toggle button in Settings panel
  updateFormFromSettings(settings);

  if (isManual) {
    lyricsViewport.focus(); // Set focus to receive key events
    $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys); // Remove first to be safe
    $('lyricsDisplay').addEventListener('keydown', handleArrowKeys);
    console.log("Manual mode ENABLED, added keydown listener.");

    // If we are enabling manual mode WHILE audio is playing, stop timer
    if (isPlaying && mainTimer) { 
      console.log("Manual mode enabled during playback: Stopping auto-scroll timer.");
      clearTimer(); 
    }

    // Set isPlaying if entering manual mode when not already playing
    if (!isPlaying) {
        console.log("Setting isPlaying = true for manual control.");
        isPlaying = true; 
    }
    
    if (currentIndex < 0) {
        setCurrentIndex(0, true);
    } else {
        setCurrentIndex(currentIndex, true);
    }

  } else {
    // Manual mode is being turned OFF
    $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
    console.log("Manual mode DISABLED, removed keydown listener.");

    // If we were playing audio and switch manual OFF, restart auto-scroll
    if (isPlaying && audio && !audio.paused) {
        console.log("Restarting auto-scroll after disabling manual mode.");
        clearTimer(); 

        const hymnEntry = allHymnsData['English']?.[currentHymnNumber]; 
        if (hymnEntry) {
            let lineTimings = [];
            let defaultSecondsPerLine = 0;
            
            if (hymnEntry.line_timings && Array.isArray(hymnEntry.line_timings) && hymnEntry.line_timings.length > 0) {
                 lineTimings = hymnEntry.line_timings.map(t => parseFloat(t) || 0.2);
            }
             if (lineTimings.length === 0 && hymnEntry.line_time !== undefined && parseFloat(hymnEntry.line_time) > 0) {
                defaultSecondsPerLine = parseFloat(hymnEntry.line_time);
            } else if (lineTimings.length === 0 && audio && audio.duration > 0) { 
                const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
                const introLength = parseFloat($("introLength").value);
                 const currentLyricsLength = (usingCustomLyrics ? lines : initialHymnLines).length;
                 if (currentLyricsLength > 0 && (audio.duration - introLength - offset) > 0) { 
                     defaultSecondsPerLine = (audio.duration - introLength - offset) / currentLyricsLength;
                 } else {
                     defaultSecondsPerLine = 5; 
                 }
            } else {
                 defaultSecondsPerLine = 5; 
            }

            if (defaultSecondsPerLine < 0.2) defaultSecondsPerLine = 0.2;
             const targetLineCount = (usingCustomLyrics ? lines : initialHymnLines).length;
            while (lineTimings.length < targetLineCount) {
                lineTimings.push(defaultSecondsPerLine);
            }
            lineTimings = lineTimings.slice(0, targetLineCount);

            startAutoScroll(lineTimings); 
        } else {
             console.warn("Cannot restart autoscroll: hymnEntry not found for:", currentHymnNumber);
        }
    } else {
         // Update isPlaying based on actual audio state
         isPlaying = !!(audio && !audio.paused); 
         console.log("Exiting manual mode. isPlaying set to:", isPlaying);
    }
  }
}

async function loadAvailableLanguages() {
  console.log("Attempting to load language data..."); // Log start
  allHymnsData = {}; // Reset data
  availableLanguages = [];
  // Keep previous languageOrder if it exists, otherwise init empty
  languageOrder = languageOrder && languageOrder.length > 0 ? languageOrder : [];

  const initialLanguages = ['English', 'Spanish', 'ASL'];
  let loadErrorOccurred = false; // Flag to track if any file fails

  for (const lang of initialLanguages) {
    const filePath = `data/hymns_${lang}.json`;
    console.log(`Fetching ${filePath}...`);
    try {
      const res = await fetch(filePath, { cache: 'no-store' });
      console.log(`Fetch status for ${lang}: ${res.status}`); // Log status

      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status} for ${filePath}`);
      }

      let hymnsData;
      try {
        hymnsData = await res.json();
        console.log(`Successfully parsed JSON for ${lang}.`);
      } catch (parseError) {
        console.error(`Error parsing JSON for ${filePath}:`, parseError);
        showNotice(`Error parsing ${lang} data file. Check file syntax.`);
        loadErrorOccurred = true;
        continue; // Skip to the next language
      }

      allHymnsData[lang] = hymnsData;
      const hasLyrics = Object.values(allHymnsData[lang]).some(hymn => 
				hymn?.lines && Array.isArray(hymn.lines) && hymn.lines.length > 0
			);

      if (hasLyrics) {
        if (!availableLanguages.includes(lang)) { // Avoid duplicates if function runs again
            availableLanguages.push(lang);
        }
        if (!languageOrder.includes(lang)) { // Add to order only if not already present
            languageOrder.push(lang);
        }
        console.log(`${lang} added as available language.`);
      } else {
        console.warn(`No lyrics found for ${lang} in ${filePath}. Excluding.`);
        showNotice(`Warning: No usable lyrics found in ${lang} data file.`);
      }

    } catch (fetchError) {
      console.error(`Failed to load or process ${filePath}:`, fetchError);
      showNotice(`Error loading ${lang} data file: ${fetchError.message}. Check file path and network.`);
      loadErrorOccurred = true;
      // Do not add the language if fetch fails
    }
  }

  // Fallback if NO languages loaded successfully
  if (availableLanguages.length === 0) {
    console.warn("No valid language data loaded successfully. Defaulting to English structure.");
    showNotice("CRITICAL: No valid hymn data found. Check 'data' folder and JSON files. Displaying basic structure.");
    availableLanguages = ['English']; // Provide a fallback structure
    if (!languageOrder.includes('English')) {
        languageOrder = ['English'];
    }
    allHymnsData['English'] = {}; // Ensure English key exists even if empty
    loadErrorOccurred = true; // Mark that an error state occurred
  } else {
      console.log("Available languages loaded:", availableLanguages);
      console.log("Initial language order:", languageOrder);
  }

  // IMPORTANT: If any error occurred during loading, throw an error
  // This will ensure the .catch block in initializePage is triggered
  // allowing consistent error handling.
  if (loadErrorOccurred) {
      throw new Error("One or more language files failed to load or parse correctly.");
  }

  console.log("Language data loading process completed.");
}

function renderLanguageList() {
  const langList = $('language-list');
  langList.innerHTML = ''; 

  // --- CRITICAL FIX: Cleanup "Phantom" Selections ---
  // Filter out any languages that are currently selected but have 0 lines for this specific song.
  // This prevents invisible languages from counting toward the "Max 3" limit.
  const previousLength = selectedLanguages.length;
  selectedLanguages = selectedLanguages.filter(lang => {
    // 1. If it's Custom, only keep it if custom lyrics are actually active
    if (lang === 'Custom') return usingCustomLyrics && lines && lines.length > 0;
    
    // 2. If it's a standard language, only keep it if it has lines for this specific song
    const hasLines = allHymnsData[lang]?.[currentHymnNumber]?.lines?.length > 0;
    return hasLines;
  });

  // If we removed anything (or if the list became empty), save and ensure at least one language exists
  if (selectedLanguages.length !== previousLength || selectedLanguages.length === 0) {
    if (selectedLanguages.length === 0 && availableLanguages.length > 0) {
         // Default to first available (usually English) if everything was wiped
         selectedLanguages.push(availableLanguages[0]);
    }
    saveSettings();
    updateLanguageSettings(); // Update the settings panel to match
    updateAudioLanguageDisplay(); // Update the audio label
  }
  // --------------------------------------------------

  languageOrder.forEach(lang => {
    let lineCount = (lang === 'Custom' && usingCustomLyrics)
    ? lines.length
    : allHymnsData[lang]?.[currentHymnNumber]?.lines?.length || 0;
    
    if (lineCount === 0 && lang !== 'Custom') return;
    if (lineCount === 0) return; 

    const li = document.createElement('li');
    li.className = 'language-item';
    li.draggable = true;
    li.dataset.lang = lang;
    
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between'; 
    li.style.alignItems = 'center';

    const div = document.createElement('div');
    div.className = 'checkbox-group';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `lang-${lang}`;
    if (selectedLanguages.includes(lang)) {
      input.checked = true;
    }
    
    const label = document.createElement('label');
    label.htmlFor = `lang-${lang}`;
    label.textContent = `${lang} (Lines: ${lineCount})`;

    div.appendChild(input); 
    div.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '❌';
    removeBtn.className = 'remove-language-btn';
    removeBtn.title = `Remove ${lang} from the Lyric Order`;
    removeBtn.type = 'button'; 
    removeBtn.dataset.lang = lang; 
    
    removeBtn.style.fontSize = '0.7em';
    removeBtn.style.padding = '0.1rem 0.3rem';
    removeBtn.style.marginLeft = '1rem'; 
    removeBtn.style.backgroundColor = 'transparent';
    removeBtn.style.border = 'none';
    removeBtn.style.cursor = 'pointer';
    
    removeBtn.addEventListener('click', deleteLanguageFromOrder);
    
    li.appendChild(div); 
    li.appendChild(removeBtn); 
    langList.appendChild(li);
  });

  // Add event listeners
  langList.querySelectorAll('.language-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item.dataset.lang);
    });
    item.addEventListener('dragover', (e) => e.preventDefault());
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedLang = e.dataTransfer.getData('text/plain');
      const targetLang = item.dataset.lang;
      const draggedIndex = languageOrder.indexOf(draggedLang);
      const targetIndex = languageOrder.indexOf(targetLang);
      languageOrder.splice(draggedIndex, 1);
      languageOrder.splice(targetIndex, 0, draggedLang);
      saveSettings();
      renderLanguageList();
      updateLanguageSettings();
      populateLyricsContainer();
      updateAudioLanguageDisplay();
      if (isPlaying && !$('manualControlOverride').checked) {
        clearTimer();
        // Restart scrolling logic if order changed
        let timingLanguage = languageOrder[0] === 'Custom' ? languageOrder[1] : languageOrder[0];
        timingLanguage = timingLanguage?.includes('SL') ? 'English' : timingLanguage;
        const hymnEntry = allHymnsData[timingLanguage]?.[currentHymnNumber] || allHymnsData['English']?.[currentHymnNumber];
        if (hymnEntry) {
             const targetLineCount = getMaxLineCount();
             // ... simplified restart logic ...
             // (Triggering a full restart via playSmart or resume is safer, but we leave this for now)
        }
      }
    });
    
    // Re-attach manual control listener if it was active
		if ($('manualControlOverride')?.checked) {
			$('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
			$('lyricsDisplay').addEventListener('keydown', handleArrowKeys);
			lyricsViewport.focus();
		}
    
    
    item.querySelector('input').addEventListener('change', (e) => {
        const lang = item.dataset.lang;
        const isChecked = e.target.checked;

        if (isChecked) {
            if (!selectedLanguages.includes(lang)) {
                if (selectedLanguages.length < 3) {
                    selectedLanguages.push(lang); 
                } else {
                    e.target.checked = false; 
                    showNotice("Maximum 3 languages can be selected.");
                    return; 
                }
            }
        } else {
            selectedLanguages = selectedLanguages.filter(l => l !== lang);
        }

        saveSettings();
        updateLanguageSettings(); 
        populateLyricsContainer(); 
        updateAudioLanguageDisplay(); 
    });
  });
}

function updateLanguageSettings() {
  const langSettingsDiv = $('language-settings');

  if (!langSettingsDiv) {
    console.error("FATAL: Could not find #language-settings div.");
    return;
  }

  langSettingsDiv.innerHTML = ''; 
  const settings = loadSettings() || {}; 

  languageOrder.forEach(lang => {
    if (!selectedLanguages.includes(lang)) return;

    const currentLangSettings = settings.languages?.[lang] || DEFAULTS.languages[lang] || DEFAULTS.languages['English'];
    const activeColorValue = currentLangSettings.fontColorActive;
    const inactiveColorValue = currentLangSettings.fontColorInactive;

    const langGroupDiv = document.createElement('div');
    langGroupDiv.className = 'control-group language-control-group';
    langGroupDiv.style.marginBottom = '1.5rem'; 
    langGroupDiv.style.borderBottom = '1px solid #e5e7eb';
    langGroupDiv.style.paddingBottom = '1rem';

    // 1. Create Main Header Label
    const mainLabel = document.createElement('label');
    mainLabel.innerHTML = `<strong>${lang} Font</strong>`;
    mainLabel.style.display = 'block';
    mainLabel.style.marginBottom = '0.5rem';
    langGroupDiv.appendChild(mainLabel);

    // 2. Create Grid Row
    const controlRow = document.createElement('div');
    controlRow.style.display = 'grid';
    controlRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
    controlRow.style.gap = '0.75rem';
    controlRow.style.alignItems = 'end';

    // --- Column 1: Active Color ---
    const activeColorGroup = document.createElement('div');
    activeColorGroup.className = 'control-subgroup';
    const activeLabel = document.createElement('label');
    activeLabel.htmlFor = `fontColor-active-${lang}`;
    activeLabel.textContent = 'Active';
    activeLabel.style.fontSize = '0.85rem';
    
    activeColorGroup.appendChild(activeLabel);
    activeColorGroup.innerHTML += createColorPickerHTML(`fontColor-active-${lang}`, activeColorValue);
    controlRow.appendChild(activeColorGroup);

    // --- Column 2: Inactive Color ---
    const inactiveColorGroup = document.createElement('div');
    inactiveColorGroup.className = 'control-subgroup';
    const inactiveLabel = document.createElement('label');
    inactiveLabel.htmlFor = `fontColor-inactive-${lang}`;
    inactiveLabel.textContent = 'Inactive';
    inactiveLabel.style.fontSize = '0.85rem';
    
    inactiveColorGroup.appendChild(inactiveLabel);
    inactiveColorGroup.innerHTML += createColorPickerHTML(`fontColor-inactive-${lang}`, inactiveColorValue);
    controlRow.appendChild(inactiveColorGroup);

    // --- Column 3: Font Size ---
    const sizeSubgroup = document.createElement('div');
    sizeSubgroup.className = 'control-subgroup';
    const sizeLabel = document.createElement('label');
    sizeLabel.htmlFor = `fontSize-${lang}`;
    sizeLabel.textContent = 'Size';
    sizeLabel.style.fontSize = '0.85rem';
    
    sizeSubgroup.appendChild(sizeLabel);

    const sizeInputGroup = document.createElement('div');
    sizeInputGroup.className = 'input-group';
    sizeInputGroup.style.height = '35px'; 
    // Ensure flex layout so buttons grow
    sizeInputGroup.style.display = 'flex'; 

    const decreaseBtn = document.createElement('button');
    decreaseBtn.className = 'btn';
    // CHANGED: Added 'flex: 1' to make button wider
    decreaseBtn.style.cssText = "height: 100%; background-color: #ADD8E6; border: 1px solid #d1d5db; border-right: none; border-top-left-radius: 6px; border-bottom-left-radius: 6px; padding: 0; display: flex; align-items: center; justify-content: center; flex: 1;";
    decreaseBtn.textContent = '-';
    decreaseBtn.onclick = () => decreaseFontSize(lang);

    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.id = `fontSize-${lang}`;
    sizeInput.className = 'form-control';
    sizeInput.min = "0.1";
    sizeInput.max = "20";
    sizeInput.step = "0.1";
    // CHANGED: Fixed width to 3rem, removed width: 100%
    sizeInput.style.cssText = "height: 100%; width: 3.5rem; text-align: center; border-radius: 0; margin: 0; padding: 0; border: 1px solid #d1d5db;";

    const increaseBtn = document.createElement('button');
    increaseBtn.className = 'btn';
    // CHANGED: Added 'flex: 1' to make button wider
    increaseBtn.style.cssText = "height: 100%; background-color: #ADD8E6; border: 1px solid #d1d5db; border-left: none; border-top-right-radius: 6px; border-bottom-right-radius: 6px; padding: 0; display: flex; align-items: center; justify-content: center; flex: 1;";
    increaseBtn.textContent = '+';
    increaseBtn.onclick = () => increaseFontSize(lang);

    sizeInputGroup.appendChild(decreaseBtn);
    sizeInputGroup.appendChild(sizeInput);
    sizeInputGroup.appendChild(increaseBtn);
    sizeSubgroup.appendChild(sizeInputGroup);
    controlRow.appendChild(sizeSubgroup);

    // Append Row
    langGroupDiv.appendChild(controlRow);
    
    // --- Progress Bar Toggle ---
    if (lang === selectedLanguages[0]) {
        const progressRow = document.createElement('div');
        progressRow.className = 'control-row';
        progressRow.style.marginTop = '0.75rem';
        progressRow.style.paddingTop = '0.5rem';
        progressRow.style.borderTop = '1px dashed #e5e7eb';

        const checkboxGroup = document.createElement('div');
        checkboxGroup.className = 'checkbox-group';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'progressBarToggle';
        cb.checked = (settings.showProgressBar !== undefined) ? settings.showProgressBar : true;
        
        cb.addEventListener('change', () => {
             saveSettings(); 
             applySettings(getSettingsFromForm()); 
        });

        const lbl = document.createElement('label');
        lbl.htmlFor = 'progressBarToggle';
        lbl.textContent = 'Lyric Progress Bar';

        checkboxGroup.appendChild(cb);
        checkboxGroup.appendChild(lbl);
        progressRow.appendChild(checkboxGroup);
        langGroupDiv.appendChild(progressRow);
    }
    
    langSettingsDiv.appendChild(langGroupDiv);

    // --- Initialize Colors ---
    updateColorDisplay(`fontColor-active-${lang}`);
    updateColorDisplay(`fontColor-inactive-${lang}`);

    // --- Listeners ---
    const activeInput = $(`fontColor-active-${lang}`); 
    const inactiveInput = $(`fontColor-inactive-${lang}`); 
    
    sizeInput.value = parseFloat(currentLangSettings.fontSize || '3').toFixed(1);

    [activeInput, inactiveInput, sizeInput].forEach(input => {
      if (input) { 
        input.addEventListener('input', () => {
          applySettings(getSettingsFromForm());
          saveSettings();
        });
      }
    });
  });
}

function decreaseFontSize(lang) {
  const fontSizeInput = $(`fontSize-${lang}`);
  let value = parseFloat(fontSizeInput.value) || 3;
  if (value > 0.1) {
    value -= 0.1;
    fontSizeInput.value = value.toFixed(1);
    applySettings(getSettingsFromForm());
    saveSettings();
  }
}

function increaseFontSize(lang) {
  const fontSizeInput = $(`fontSize-${lang}`);
  let value = parseFloat(fontSizeInput.value) || 3;
  if (value < 20) {
    value += 0.1;
    fontSizeInput.value = value.toFixed(1);
    applySettings(getSettingsFromForm());
    saveSettings();
  }
}

function deleteLanguageFromOrder(event) {
    // Prevent the click from bubbling up (good practice)
    event.stopPropagation();

    const langToRemove = event.currentTarget.dataset.lang;

    if (!confirm(`Are you sure you want to remove '${langToRemove}'? This will delete any saved data for this language.`)) {
        return;
    }

    // 1. Remove from Order list
    languageOrder = languageOrder.filter(l => l !== langToRemove);

    // 2. Remove from Selection list
    selectedLanguages = selectedLanguages.filter(l => l !== langToRemove);

    // 3. Special handling for 'Custom' lyrics
    if (langToRemove === 'Custom') {
        // --- NEW: Completely wipe Custom data ---
        customLyricsStore = {}; 
        
        // Clear the input box immediately
        const textarea = $('customLyricsTextarea');
        if (textarea) textarea.value = '';

        // Reset internal state to use standard lyrics
        usingCustomLyrics = false;
        lines = [...initialHymnLines];
        
        // Remove from available languages so it doesn't reappear
        availableLanguages = availableLanguages.filter(l => l !== 'Custom');
        // ----------------------------------------
    }
    
    // Ensure we always have at least one language selected
    if (selectedLanguages.length === 0) {
        if (languageOrder.length > 0) {
             selectedLanguages.push(languageOrder[0]);
        } else if (availableLanguages.length > 0) {
             selectedLanguages.push(availableLanguages[0]);
        }
    }

    // 4. Save and Update UI
    saveSettings(); // This overwrites localStorage with the empty customLyricsStore
    renderLanguageList();
    updateLanguageSettings();
    populateLyricsContainer();
    updateAudioLanguageDisplay();
    
    // Update the line count display (Custom vs Original)
    updateLiveCounter(); 

    showNotice(`'${langToRemove}' removed and data cleared.`);
}

function adjustTransitionSpeed(amount) {
    const input = document.querySelector('#transitionSpeed');
    let value = parseFloat(input.value) || 0.5;
    value += amount;
    value = Math.max(0.1, Math.min(2.0, value));
    input.value = value.toFixed(1);
    applySettings(getSettingsFromForm());
    saveSettings();
}

function showNotice(msg) {
  const el = $('notice');
  if (el) {
    el.style.display = msg ? "block" : "none";
    el.textContent = msg;
  }
}

function setView(viewName) {
  currentView = viewName;
  const page = document.querySelector('.page');
  const mainPanel = $('main-panel');
  const customLyricsEntry = $('custom-lyrics-entry');
  const viewHymnBtn = $('viewHymnBtn');
  const viewCustomBtn = $('viewCustomBtn');

  // Add/Remove classes for overall page layout changes if needed
  page?.classList.toggle('custom-view-active', viewName === 'custom');
  mainPanel?.classList.toggle('custom-view-active', viewName === 'custom');

  // Toggle button active states
  viewHymnBtn?.classList.toggle('active', viewName === 'hymn');
  viewCustomBtn?.classList.toggle('active', viewName === 'custom');


  if (viewName === 'hymn') {
    lyricsViewport.style.display = 'block'; // Or 'flex' if it's a flex container
    customLyricsEntry.style.display = 'none';
    populateLyricsContainer(); // Re-populate hymn lyrics when switching back
    const hasAudio = !!currentHymnNumber; // Check if a hymn is actually loaded
    
    // --- THIS IS THE CORRECTED LINE ---
    // The last argument is now 'false', not '!hasAudio'
    // This prevents the Stop button from lighting up immediately upon load.
    const isPausedState = audio && audio.paused && !isPlaying && audio.currentTime > 0;
    
    enablePlaybackControls(isPlaying, isPausedState, false);
    
    $('customLyricsTextarea').blur(); // Remove focus from textarea
    
    // Ensure manual control listener/focus is active if checkbox is checked
    const manualCheckbox = $('manualControlOverride');
    if (manualCheckbox && manualCheckbox.checked) {
        console.log("setView('hymn'): Re-applying manual control listener/focus.");
        lyricsViewport.focus(); // Set focus
        // Re-add listener (remove first just to be safe)
        $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
        $('lyricsDisplay').addEventListener('keydown', handleArrowKeys);
        // Ensure isPlaying state reflects manual mode if audio isn't running
        if (!audio || audio.paused) {
             isPlaying = true; // Allows manual advance via arrows
        }
        // Make sure UI reflects manual state (e.g., hide speed display)
        $('metaSPL').style.display = 'none';
        lyricsViewport.classList.add('manual-active'); // Ensure class is present
    } else {
         // If manual isn't checked, ensure state is clean
         $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
         $('metaSPL').style.display = 'inline-block'; // Show speed if not manual
         lyricsViewport.classList.remove('manual-active'); // Ensure class is absent
    }
    
  } else { // viewName === 'custom'
    stopHymn(); // Stop playback when switching to custom view
    lyricsViewport.style.display = 'none';
    customLyricsEntry.style.display = 'flex'; // Use 'flex' since it's a flex container
		const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
    const savedCustomLyrics = customLyricsStore[hymnKey];
    $('customLyricsTextarea').value = savedCustomLyrics ? savedCustomLyrics.join('\n') : '';    

		updateLiveCounter(); // Update custom line count
    // No need to set usingCustomLyrics = true here, that happens when loading custom lyrics
    enablePlaybackControls(false, false, true); // Disable playback controls in custom view
  }
}

function loadCustomLyrics() {
  const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
  const text = $('customLyricsTextarea').value.trim();
  const newLines = text.split('\n').filter(l => l.trim() !== '');
  
  if (newLines.length === 0) {
    delete customLyricsStore[hymnKey];
    usingCustomLyrics = false;
  } else {
    customLyricsStore[hymnKey] = newLines;
    lines = newLines;
    usingCustomLyrics = true;

    // --- FIX START: FORCE CUSTOM BACK INTO THE LIST ---
    // 1. Ensure it is marked as available
    if (!availableLanguages.includes('Custom')) {
      availableLanguages.push('Custom');
    }
    
    // 2. Ensure it is in the sort order (Lyric Order list)
    if (!languageOrder.includes('Custom')) {
      languageOrder.push('Custom');
    }

    // 3. Auto-select it (if we haven't hit the limit of 3)
    if (!selectedLanguages.includes('Custom')) {
      if (selectedLanguages.length < 3) {
        selectedLanguages.push('Custom');
      } else {
        // Optional: specific notice if they are full
        showNotice("Custom lyrics loaded. Uncheck another language to view them.");
      }
    }
    // --- FIX END ---
  }
  
  updateLiveCounter();
  renderLanguageList();
  saveSettings();     // <--- Keeps settings saved
  
  // ADD THIS LINE HERE:
  updateLanguageSettings(); // <--- This rebuilds the settings panel row
  
  setView('hymn');
}

function loadExcelLyrics() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.xls,.xlsx';
  fileInput.onchange = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx')) {
      showNotice('Please select a valid Excel file (.xls or .xlsx).');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        let startProcessing = false;
        const lyricsLines = [];
        for (const row of jsonData) {
          const cells = Array.isArray(row) ? row : [];
          const validCells = cells
            .map(cell => cell != null ? String(cell).trim() : '')
            .filter(cell => cell !== '');
          const rowText = validCells.join('|');
          if (rowText.toLowerCase().startsWith('verse 1')) {
            startProcessing = true;
            continue;
          }
          if (startProcessing && rowText !== '' && !rowText.toLowerCase().startsWith('verse ') && !rowText.toLowerCase().startsWith('chorus')) {
            lyricsLines.push(rowText);
          }
        }
        if (lyricsLines.length === 0) {
          showNotice('No valid lyrics found after "Verse 1" in the Excel file. Ensure data starts with "Verse 1".');
          return;
        }

        $('customLyricsTextarea').value = lyricsLines.join('\n');

const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
customLyricsStore[hymnKey] = lyricsLines;
lines = customLyricsStore[hymnKey];
usingCustomLyrics = true;

// === CLEAN CUSTOM LANGUAGE HANDLING ===
if (!availableLanguages.includes('Custom')) {
    availableLanguages.push('Custom');
}
if (!languageOrder.includes('Custom')) {
    languageOrder.push('Custom');  // Only once
}
if (!selectedLanguages.includes('Custom')) {
    if (selectedLanguages.length < 3) {
        selectedLanguages.push('Custom');
    } else {
        showNotice("Max 3 languages selected. Custom lyrics loaded but not displayed.");
    }
}
        updateLiveCounter();
        renderLanguageList();
        saveSettings();
        showNotice(`Imported ${lyricsLines.length} lines from Excel.`);
      } catch (error) {
        console.error('Error parsing Excel:', error);
        showNotice('Error reading the Excel file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };
  fileInput.click();
}

function resetLyrics() {
  if (initialHymnLines.length === 0) return;
  lines = [...initialHymnLines];
  usingCustomLyrics = false;
  const params = new URLSearchParams(location.search);
  currentHymnNumber = params.get("n");
  const title = getHymnTitleFromJSON(currentHymnNumber);
  $('pageHeader').textContent = `Hymn ${currentHymnNumber} - ${title}`;
	analyzeVerses();
  renderVerseSelection();
  $('introLength').value = allHymnsData['English']?.[currentHymnNumber]?.intro_length !== undefined ? parseFloat(allHymnsData['English'][currentHymnNumber].intro_length).toFixed(1) : 5;
  setView('hymn');
  loadAvailableLanguages().then(() => {
    renderLanguageList();
    updateLanguageSettings();
  });
}

function resetVerseDelay() {
    const el = document.getElementById('verseDelay');
    if (el) {
        el.value = 0;
        // Dispatch event to trigger the color change listener we added earlier
        el.dispatchEvent(new Event('input')); 
    }
}

function updateLineCountDisplay() {
  const displayEl = $('lineCountDisplay');
  if (!displayEl) return;
  const currentCount = lines.length;
  const originalCount = initialHymnLines.length;
  if (usingCustomLyrics && originalCount > 0) {
    const countsMatch = currentCount === originalCount;
    const styleClass = countsMatch ? '' : 'class="count-mismatch"';
    displayEl.innerHTML = `
      <div class="count-item">Custom: <strong ${styleClass}>${currentCount}</strong></div>
      <div class="count-item">Original: <strong>${originalCount}</strong></div>
    `;
  } else {
    displayEl.innerHTML = `<strong>${currentCount || '-'}</strong>`;
  }
}

function updateLiveCounter() {
  const displayEl = $('live-line-counter');
  const customText = $('customLyricsTextarea').value;
  const currentCount = customText === '' ? 0 : customText.split('\n').filter(line => line.trim() !== '').length;
  const originalCount = initialHymnLines.length;
  if (originalCount > 0) {
    const countsMatch = currentCount === originalCount;
    const styleClass = countsMatch ? '' : 'class="count-mismatch"';
    displayEl.innerHTML = `
      <div class="count-item">Custom: <strong ${styleClass}>${currentCount}</strong></div>
      <div class="count-item">Original: <strong>${originalCount}</strong></div>
    `;
  } else {
    displayEl.innerHTML = `<div class="count-item">Lines: <strong>${currentCount}</strong></div>`;
  }
}

function populateLyricsContainer() {
    lyricsContainer.innerHTML = '';
    lyricsContainer.appendChild(Object.assign(document.createElement('div'), { className: 'spacer' }));
    
    // --- UPDATED LOGIC: Find the maximum line count among ALL selected languages ---
    const maxLines = getMaxLineCount();
    // ------------------------------------------------------------------------------

    for (let index = 0; index < maxLines; index++) {
        const div = document.createElement('div');
        div.className = 'lyric-line-group';
        div.id = `line-${index}`;
        
        let progressBarAdded = false; 

        languageOrder.forEach(lang => {
            if (!selectedLanguages.includes(lang)) return;

            let lineText = '';

            // Get text safely
            if (lang === 'Custom' && usingCustomLyrics) {
                lineText = (lines[index] || '').replace(/-/g, '\u2011');
            } else if (allHymnsData[lang]?.[currentHymnNumber]?.lines) {
                if (lang !== 'Custom') {
                    lineText = (allHymnsData[lang][currentHymnNumber].lines[index] || '').replace(/-/g, '\u2011');
                } else if (!usingCustomLyrics) {
                    lineText = (allHymnsData[lang][currentHymnNumber].lines[index] || '').replace(/-/g, '\u2011');
                }
            }

            const p = document.createElement('p');
            p.className = `lyric-line lyric-line-${lang}`;
            
            // This variable determines where the progress bar gets attached.
            let contentTarget = p; 

            // Handle Beats (Dots)
            if ((lang.includes('SL') || (lang === 'Custom' && lineText.includes('|')))) {
                const beats = lineText.split('|').map(s => s.trim());
                beats.forEach((beatText, i) => {
                    const segment = document.createElement('span');
                    segment.className = 'beat-segment';
                    segment.textContent = beatText;
                    p.appendChild(segment);
                    if (i < beats.length - 1) {
                        const separator = document.createElement('span');
                        separator.className = 'beat-separator';
                        separator.textContent = '•';
                        p.appendChild(separator);
                    }
                });
            } else if (lineText) {
                // --- NEW LOGIC: SEPARATE LABEL FROM LYRICS ---
                // Regex looks for "1:", "Ch:", "Bridge:", "V1:", etc, followed by space
                const match = lineText.match(/^(\d+:|Ch:|Chorus:|Bridge:|V\d+:)\s+(.*)/i);
                
                if (match) {
                    const label = match[1];  // e.g., "1:"
                    const lyrics = match[2]; // e.g., "Amazing Grace"

                    // 1. Create Label Span (No progress bar here)
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'lyric-prefix';
                    labelSpan.textContent = label;
                    labelSpan.style.marginRight = '0.4em'; // Add a little space

                    // *** SKIP CHECK INSERTED HERE ***
                    // Check if this label is in our global skip list
                    if (typeof skippedVerseLabels !== 'undefined' && skippedVerseLabels.includes(label)) {
                        const skipSpan = document.createElement('span');
                        skipSpan.className = 'skipped-indicator';
                        skipSpan.textContent = "(Skip)";
                        labelSpan.appendChild(skipSpan);
                        
                        // Optional: Gray out the text if skipped
                        p.style.opacity = "0.6"; 
                    }
                    // ********************************

                    // 2. Create Content Span (Progress bar goes HERE)
                    const contentSpan = document.createElement('span');
                    contentSpan.className = 'lyric-text-content';
                    contentSpan.textContent = lyrics;
                    contentSpan.style.position = 'relative'; // Essential for bar positioning
                    contentSpan.style.display = 'inline-block'; 

                    // 3. Assemble
                    p.appendChild(labelSpan);
                    p.appendChild(contentSpan);

                    // 4. Update the target so the bar appends to the lyrics only
                    contentTarget = contentSpan;

                } else {
                    // No label found, but we wrap in a span anyway for consistency
                    // so the bar behaves the same way (under the text)
                    const contentSpan = document.createElement('span');
                    contentSpan.className = 'lyric-text-content';
                    contentSpan.textContent = lineText;
                    contentSpan.style.position = 'relative';
                    contentSpan.style.display = 'inline-block';

                    p.appendChild(contentSpan);
                    contentTarget = contentSpan;
                }
                // --- END NEW LOGIC ---

            } else if (lang !== 'Custom') {
                 if (index === 0 && !allHymnsData[lang]?.[currentHymnNumber]?.lines) {
                    p.textContent = `${lang} lyrics not available`;
                 }
            }

            // Insert Bar
            if (p.hasChildNodes()) {
                if (!progressBarAdded && lineText && lineText.trim() !== '') {
                    const progressContainer = document.createElement('div');
                    progressContainer.className = 'line-progress-container';
                    // Ensure the bar is positioned absolutely relative to the contentSpan
                    progressContainer.style.position = 'absolute'; 
                    progressContainer.style.bottom = '0';
                    progressContainer.style.left = '0';
                    progressContainer.style.width = '100%';

                    progressContainer.innerHTML = `
                        <div class="line-progress-bar">
                            <div class="line-progress-knob"></div>
                        </div>
                    `;
                    
                    // Attach to the specific target (the lyrics span), not the whole P
                    contentTarget.appendChild(progressContainer);
                    progressBarAdded = true;
                }
                div.appendChild(p);
            }
        });
        
        if (div.hasChildNodes()) {
            lyricsContainer.appendChild(div);
        }
    }
    
    lyricsContainer.appendChild(Object.assign(document.createElement('div'), { className: 'spacer' }));
    requestAnimationFrame(() => {
        applySettings(getSettingsFromForm());
        if (maxLines > 0) {
            setCurrentIndex(currentIndex, true);
        }
    });
    
    // Re-attach manual control if active
    if ($('manualControlOverride')?.checked) {
        $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
        $('lyricsDisplay').addEventListener('keydown', handleArrowKeys);
        lyricsViewport.focus();
    }
}
function setCurrentIndex(newIdx, instant = false, shouldHighlight = true) {
  
  if (newIdx !== currentIndex) {
      hasPausedForCurrentVerse = false;
  }
  
  // Remove highlight from previous line
  const currentLineEl = lyricsContainer.querySelector('.is-current');
  if (currentLineEl) currentLineEl.classList.remove('is-current');
  
  const totalLines = getMaxLineCount();
  
  if (newIdx < 0 || newIdx >= totalLines) {
    currentIndex = -1;
    return;
  }

  const nextLineEl = $(`line-${newIdx}`);
  if (!nextLineEl) return;
  
  // Calculate Scroll Position (35% from top)
  const viewportHeight = lyricsViewport.clientHeight;
  const targetScrollTop = nextLineEl.offsetTop - (viewportHeight * 0.22) + (nextLineEl.offsetHeight / 2);
  
  if (instant) {
    lyricsContainer.style.transition = 'none';
    lyricsContainer.style.transform = `translateY(-${targetScrollTop}px)`;
    setTimeout(() => {
      lyricsContainer.style.transition = `transform var(--transition-speed) ease-in-out`;
    }, 50);
  } else {
    lyricsContainer.style.transform = `translateY(-${targetScrollTop}px)`;
  }
  
  // --- FIX: Only add the class if requested ---
  if (shouldHighlight) {
      nextLineEl.classList.add('is-current');
  }
  
  currentIndex = newIdx;
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function updateCounter() {
  if (!audio || isNaN(audio.duration)) {
    $('metaCounter').textContent = "- / -";
    return;
  }
  const currentTime = formatTime(audio.currentTime);
  const totalTime = formatTime(audio.duration);
  $('metaCounter').textContent = `${currentTime} / ${totalTime}`;
}

function startIntroCountdown(duration) {
  return new Promise(resolve => {
    window.introResolver = resolve;

    const countdownEl = $('countdown-display');
    const countdownNumEl = countdownEl.querySelector('.countdown-number');
    
    // Get the full Intro Length from the settings
    const introLen = parseFloat($("introLength").value) || 0;
    
    // --- RESTORED: Stop counting 3 seconds early (at 3, 2, 1...) ---
    // This gives you a "Get Ready" gap where lyrics are visible but not highlighted.
    const targetAudioTime = Math.max(0, introLen - 3 * playbackRate);

    lyricsViewport.classList.add('is-counting-down');
    countdownEl.classList.add('is-visible');
    
    if (audio) {
        const initialRem = Math.max(0, introLen - audio.currentTime);
        countdownNumEl.textContent = Math.ceil(initialRem / playbackRate);
    }
    
    clearTimer();

    mainTimer = setInterval(() => {
      if (!audio || audio.paused) return;

      const currentTime = audio.currentTime;
      const remainingTime = introLen - currentTime;

      const secondsLeft = Math.ceil(remainingTime / playbackRate);
      if (secondsLeft > 0) {
          countdownNumEl.textContent = secondsLeft;
      }

      if (currentTime >= targetAudioTime) {
        clearTimer();
        
        // Hide the countdown overlay
        countdownEl.classList.remove('is-visible');
        lyricsViewport.classList.remove('is-counting-down');
        
        // --- NEW: Immediately reveal lyrics (remove gray overlay) ---
        lyricsViewport.classList.remove('intro-active'); 
        
        resolve(); 
      }
    }, 100);
  });
}

function togglePauseResume() {
  const icon = $('pauseIcon');
  const text = $('pauseText');

  if (isPlaying) {
    // We are currently playing, so we want to PAUSE
    pauseHymn();
    if(icon) icon.innerHTML = '&#9654;'; // Play/Resume icon
    if(text) text.textContent = 'Resume';
  } else {
    // We are paused, so we want to RESUME
    resumeHymn();
    if(icon) icon.innerHTML = '&#9208;'; // Pause icon
    if(text) text.textContent = 'Pause';
  }
}

function initializeAudio(hymnNumber, wasPlaying = false, currentTime = 0, onManualSetup = null) {
    loadTempoForCurrentHymn();

    if (!hymnNumber) return console.warn("initializeAudio called with no hymn number.");

    const trackType = $('trackType').checked ? 'voice' : 'accompaniment';
    const folder = trackType === 'voice' ? 'voice' : 'accompaniment';

    // 1. Determine Source Language
    let requestedLang = languageOrder[0] || 'English';
    if (requestedLang === 'Custom' && languageOrder.length > 1) requestedLang = languageOrder[1];
    if (requestedLang === 'ASL') requestedLang = 'English';

    let hymnEntry = null;
    let sourceLang = requestedLang;

    // Follow the data
    if (allHymnsData[requestedLang]?.[hymnNumber]) {
        hymnEntry = allHymnsData[requestedLang][hymnNumber];
        sourceLang = requestedLang;
    } else if (allHymnsData['English']?.[hymnNumber]) {
        hymnEntry = allHymnsData['English'][hymnNumber];
        sourceLang = 'English'; 
    }

    $('audioLanguage')?.setTextContent?.(`${sourceLang} Music`);

    if (!hymnEntry) return forceManualMode("No hymn data");

    const rawURL = trackType === 'voice' ? hymnEntry.voiceURL : hymnEntry.accompanimentURL;
    const isCopyrightListed = rawURL && rawURL.toLowerCase().includes('copyright');

    // 2. Define Local Path Variants
    // Variant A: Exact Number (e.g., "86.mp3" or "219.mp3")
    const localPathNormal = `audio/${sourceLang}/${folder}/${hymnNumber}.mp3`;
    
    // Variant B: Padded Number (e.g., "086.mp3"). 
    // Note: For "219", this is still "219.mp3", which causes the loop if we aren't careful.
    const paddedNumber = hymnNumber.toString().padStart(3, '0'); 
    const localPathPadded = `audio/${sourceLang}/${folder}/${paddedNumber}.mp3`;

    // 3. Start Source
    let currentSource = "";

    if (isCopyrightListed || !rawURL || !rawURL.trim()) {
        currentSource = localPathNormal;
    } else {
        currentSource = rawURL;
    }

    console.log(`[Audio Init] Hymn ${hymnNumber} | Trying: ${currentSource}`);

    if (audio) { 
        audio.pause(); 
        audio.onerror = null; // Remove old listeners to be safe
        audio = null; 
    }

    audio = new Audio(currentSource);
    audio.playbackRate = playbackRate;
    audio.preload = 'metadata';
    audio.currentTime = currentTime;

    // --- SUCCESS HANDLER ---
    audio.onloadedmetadata = () => {
        console.log(`[Audio Success] Loaded: ${currentSource}`);
        startCounterTick();
        audio.addEventListener('timeupdate', updateCounter);
        audio.addEventListener('ended', onAudioEnded);
        
        if ($('manualControlOverride')?.checked) {
            $('manualControlOverride').checked = false;
            toggleManualControl();
        }
        
        if (wasPlaying) {
            audio.play().catch(err => console.warn("Auto-play blocked:", err));
        }
        enablePlaybackControls(wasPlaying, !wasPlaying && currentTime > 0);
    };

    // --- ERROR / FALLBACK HANDLER ---
    audio.onerror = (e) => {
        const failedSource = currentSource; // Capture what failed
        
        // Prevent infinite recursion by removing listener if we are done
        // (We will re-add logic below if we decide to retry)

        console.warn(`[Audio 404] Failed to load: ${failedSource}`);

        // STEP 1: If Internet URL failed, try Local Normal
        if (failedSource !== localPathNormal && failedSource !== localPathPadded) {
            console.log(`[Audio Fallback 1] Switching to local: ${localPathNormal}`);
            currentSource = localPathNormal;
            audio.src = localPathNormal;
            audio.load();
            return;
        }

        // STEP 2: If Local Normal failed, try Local Padded
        // CRITICAL FIX: Only try this if padded is DIFFERENT from normal
        // This prevents the infinite loop on 3-digit hymns (where 219 == 219)
        if (failedSource === localPathNormal && localPathNormal !== localPathPadded) {
            console.log(`[Audio Fallback 2] ${hymnNumber}.mp3 failed. Trying padded: ${localPathPadded}`);
            currentSource = localPathPadded;
            audio.src = localPathPadded;
            audio.load();
            return;
        }

        // STEP 3: Total Failure
        // Stop the listener so it doesn't loop
        audio.onerror = null; 

        if (isCopyrightListed) {
            console.warn("[Audio Blocked] Copyrighted & Local file missing.");
            showNotice(`Copyrighted audio. Local file (${hymnNumber}.mp3) not found.`);
            forceManualMode("Copyrighted Content");
        } else {
            console.error(`[Audio Failed] Could not find ${hymnNumber}.mp3 in audio/${sourceLang}/${folder}/`);
            showNotice(`Audio not found locally: ${hymnNumber}.mp3`);
            forceManualMode("Audio file not found");
        }
    };

    function forceManualMode(msg = "No audio available") {
        if (audio) { audio.pause(); audio = null; }
				setPlayLoading(false);
				showNotice(msg); 
				const cb = $('manualControlOverride');
        if (cb && !cb.checked) { 
            cb.checked = true; 
            toggleManualControl(); 
        } else {
             enablePlaybackControls(false, false, false);
             setCurrentIndex(0, true);
        }
    }
}

function playHymn() {
  if (!currentHymnNumber && !usingCustomLyrics) {
    showNotice("No hymn selected and no custom lyrics loaded.");
    return;
  }
  const currentLyrics = usingCustomLyrics ? lines : initialHymnLines;
  if (!currentLyrics || currentLyrics.length === 0) {
    showNotice("No lyrics available to display for the current selection.");
    return;
  }
  
  // 1. START LOADING SPINNER
  setPlayLoading(true);

  stopHymn();
  console.log("playHymn: Called. State reset.");

  // Custom lyrics only (manual mode)
  if (usingCustomLyrics && !currentHymnNumber) {
    showNotice("Playing custom lyrics without audio. Use Manual Control.");
    isPlaying = true;
    const manualCheckbox = $('manualControlOverride');
    if (manualCheckbox && !manualCheckbox.checked) manualCheckbox.checked = true;
    toggleManualControl();
    enablePlaybackControls(true, false);
    currentIndex = -1;                
    populateLyricsContainer();        
    return;
  }

  // Normal hymn with audio
  console.log(`playHymn: Attempting to initialize audio for Hymn ${currentHymnNumber}...`);
  currentIndex = -1;                  
  populateLyricsContainer();          
  enablePlaybackControls(false, false, false);
  document.querySelectorAll('input, textarea, button').forEach(el => el.blur());

  // --- NEW: Calculate Start Time & Fade Logic ---
  const rawIntroLength = parseFloat($("introLength").value) || 0;
  const skipIntro = $('skipIntro') ? $('skipIntro').checked : false;
  
  let startTime = 0;
  let shouldFade = false;

  // Only skip if intro is longer than 5 seconds
  if (skipIntro && rawIntroLength > 5) {
      startTime = rawIntroLength - 5;
      shouldFade = true;
      console.log(`Skipping Intro. Starting at ${startTime}s (Intro is ${rawIntroLength}s)`);
  }
  // ----------------------------------------------

  initializeAudio(currentHymnNumber, false, startTime, () => {
    isPlaying = true;
    enablePlaybackControls(false, false, true);
  });

  audio.onloadedmetadata = async () => {
    // Safety check for intro vs duration
    if (rawIntroLength >= audio.duration) {
      showNotice("Intro length exceeds audio duration. Playback stopped.");
      stopHymn();
      return;
    }
    
    updateCounter();
    
    // --- Timing Calculation (Same as before) ---
    const hymnEntry = allHymnsData['English']?.[currentHymnNumber] || {};
    currentLineTimings = [];
    let defaultSecondsPerLine = 0;
    if (hymnEntry && hymnEntry.line_timings && Array.isArray(hymnEntry.line_timings) && hymnEntry.line_timings.length > 0) {
      currentLineTimings = hymnEntry.line_timings.map(t => parseFloat(t) || 0.2);
    }
    if (currentLineTimings.length === 0 && hymnEntry && hymnEntry.line_time !== undefined && parseFloat(hymnEntry.line_time) > 0) {
      defaultSecondsPerLine = parseFloat(hymnEntry.line_time);
    } else if (currentLineTimings.length === 0) {
      const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
      defaultSecondsPerLine = (audio.duration - rawIntroLength - offset) / (hymnEntry?.lines?.length || initialHymnLines.length);
    }
    if (defaultSecondsPerLine < 0.2) defaultSecondsPerLine = 0.2;
    const targetLineCount = getMaxLineCount();
    while (currentLineTimings.length < targetLineCount) {
      currentLineTimings.push(defaultSecondsPerLine);
    }
    currentLineTimings = currentLineTimings.slice(0, targetLineCount);
    const avgSecondsPerLine = currentLineTimings.reduce((sum, t) => sum + t, 0) / currentLineTimings.length;
    $('metaSPL').textContent = `Speed: ${avgSecondsPerLine.toFixed(2)} sec/line`;

    lyricsViewport.classList.add('intro-active');
  
    const accidentalHighlight = lyricsContainer.querySelector('.is-current');
    if (accidentalHighlight) accidentalHighlight.classList.remove('is-current');
  
    isPlaying = true;
    
    try {
            // --- NEW: Apply Fade In ---
            if (shouldFade) {
                fadeInAudio(audio, 2500); // 2.5 second fade
            } else {
                audio.volume = 1.0; // Ensure full volume if not fading
            }
            // --------------------------

            // 1) Ask browser to start playback 
            await audio.play();
    
            // 2) Wait until playback is actually moving
            await waitForActualPlayback(audio);
    
            // 3. STOP SPINNER
            setPlayLoading(false);

            // 4) Start timing
            startCounterTick();
            enablePlaybackControls(true);
    
            // Run the intro countdown
            // NOTE: The countdown logic automatically calculates (IntroLength - CurrentTime)
            // So if we skipped ahead, the countdown will naturally start at 5.
            await startIntroCountdown(rawIntroLength / playbackRate);
            
            // Wait loop
            while (audio.currentTime < rawIntroLength && !audio.paused) {
                await new Promise(r => setTimeout(r, 50));
            }
            console.log("Countdown ended, starting auto-scroll for line 0");
    
    } catch (err) {
            handlePlayError(err);
            return; 
    }
    
    lyricsViewport.classList.remove('intro-active');
    setCurrentIndex(0, true, true);
    
    if (!$('manualControlOverride').checked) {
            startAutoScroll(currentLineTimings);
    } else {
            lyricsViewport.focus();
    }
  };
}

function stopHymn() {
  setPlayLoading(false); 
  clearInterval(window.counterInterval);
  isPlaying = false;
  showNotice('');
  
  if (audio) { 
    audio.pause(); 
    audio.currentTime = 0; 
  }
  
  clearTimer();

  // Reset animations
  document.querySelectorAll('.beat-segment.is-glowing').forEach(el => {
    el.classList.remove('is-glowing');
  });

  // Reset UI elements
  $('metaCounter').textContent = "- / -";
  if (!currentHymnNumber) $('audioLanguage').textContent = '';
  $('countdown-display').classList.remove('is-visible');

  document.querySelectorAll('.line-progress-bar').forEach(bar => {
      bar.style.transition = 'none';
      bar.style.width = '0%';
  });

  lyricsViewport.classList.remove('is-counting-down', 'intro-active');
  enablePlaybackControls(false);

  // --- CRITICAL FIX ---
  // 1. Reset the index tracker to 0 immediately so the rebuild knows where to look
  currentIndex = 0;

  // 2. Force the container to the top immediately (bypass transition)
  lyricsContainer.style.transition = 'none';
  lyricsContainer.style.transform = 'translateY(0px)';

  // 3. Rebuild lyrics 
  // (Because currentIndex is now 0, this will automatically highlight the first line)
  populateLyricsContainer();

  // 4. Cleanup listeners
  $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
}

function onAudioEnded() {
  isPlaying = false;
  clearTimer();
  enablePlaybackControls(false);
  const currentLineEl = lyricsContainer.querySelector('.is-current');
  if (currentLineEl) {
    currentLineEl.classList.remove('is-current');
  }
  $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
}

function toggleLyricOrder() {
  const lyricOrderGrid = $('lyric-order-grid');
  const lyricOrderIcon = $('lyric-order-icon');
  const isCollapsed = lyricOrderGrid.classList.toggle('is-collapsed');
  lyricOrderIcon.textContent = isCollapsed ? '▶' : '▼';
}

function toggleSettings() {
  const settingsGrid = $('settings-grid');
  const settingsIcon = $('settings-icon');
  const isCollapsed = settingsGrid.classList.toggle('is-collapsed');
  settingsIcon.textContent = isCollapsed ? '▶' : '▼';
}

function initializePage() {
  languageOrder = [...new Set(languageOrder)];
  selectedLanguages = [...new Set(selectedLanguages)];
  const params = new URLSearchParams(location.search);
  runlistNumbers = params.get("runlist") ? params.get("runlist").split(',').map(s => s.trim()) : [];
  console.log("InitializePage: Starting.");

  if (performance.navigation.type === 1) {
    languageOrder = languageOrder.filter((l, i, a) => l !== 'Custom' || i === a.lastIndexOf('Custom'));
    selectedLanguages = selectedLanguages.filter((l, i, a) => l !== 'Custom' || i === a.indexOf('Custom'));
  }

  try {
    initializeColorPalette();
    console.log("InitializePage: Color palette initialized.");
  } catch (paletteError) {
    console.error("InitializePage: Error initializing color palette:", paletteError);
    showNotice("Error setting up color palette.");
  }

  try {
    setView('hymn');
    console.log("InitializePage: Default view set to 'hymn'.");
  } catch (setViewError) {
    console.error("InitializePage: Error setting initial view:", setViewError);
    alert("Critical error setting up initial view. Page may not function correctly.");
    return;
  }

  loadAvailableLanguages().then(() => {
    console.log("InitializePage .then(): Language data loaded, processing...");

    let savedSettings = null;
    try {
      savedSettings = loadSettings();
      if (savedSettings?.customLyricsStore && Object.keys(savedSettings.customLyricsStore).length > 0) {
          if (!availableLanguages.includes('Custom')) {
              availableLanguages.push('Custom');
              console.log("Restored 'Custom' to available languages based on saved data.");
          }
      }
      console.log("InitializePage .then(): Settings loaded from localStorage.");
    } catch (e) {
      console.error("Error loading saved settings:", e);
      savedSettings = null;
    }

    try {
      if (savedSettings?.languageOrder && Array.isArray(savedSettings.languageOrder)) {
        languageOrder = savedSettings.languageOrder.filter(lang =>
          availableLanguages.includes(lang) || lang === 'Custom'
        );
        availableLanguages.forEach(lang => {
          if (!languageOrder.includes(lang)) languageOrder.push(lang);
        });
      } else {
        languageOrder = [...availableLanguages];
      }

      if (savedSettings?.selectedLanguages && Array.isArray(savedSettings.selectedLanguages)) {
        selectedLanguages = savedSettings.selectedLanguages.filter(lang =>
          availableLanguages.includes(lang) || lang === 'Custom'
        );
        if (selectedLanguages.length === 0 && availableLanguages.length > 0) {
          selectedLanguages = [availableLanguages[0]];
        }
      } else if (availableLanguages.length > 0) {
        selectedLanguages = [availableLanguages[0]];
      }
      console.log("Language order & selection restored:", { languageOrder, selectedLanguages });
    } catch (e) {
      console.error("Error restoring language order/selection:", e);
      languageOrder = [...availableLanguages];
      selectedLanguages = availableLanguages.length > 0 ? [availableLanguages[0]] : [];
    }

    const settingsToApply = { ...DEFAULTS, ...(savedSettings || {}) };
    applySettings(settingsToApply);
    updateFormFromSettings(settingsToApply);

    const runlistPanel = $('runlist-panel');
    let hymnDataLoaded = false;

    try {
      if (runlistNumbers.length > 0) {
        console.log("InitializePage .then(): Processing runlist...");
        localStorage.removeItem('skippedVersesStore'); 
    		skippedVerseLabels = [];
        currentHymnNumber = runlistNumbers[0];
        currentRunlistIndex = 0;
        // Set initial indicator to 1
        const indicator = $('runlistIndicator');
        if (indicator) indicator.textContent = "1";
        
        const firstEntry = allHymnsData['English']?.[currentHymnNumber] || {};

        if (Object.keys(firstEntry).length > 0) {
          hymnDataLoaded = true;
          if (runlistPanel) runlistPanel.style.display = 'block';

          const runlistDisplay = $('runlist-display');
          if (!runlistDisplay) throw new Error("Runlist display element not found!");
          runlistDisplay.innerHTML = '';

          // --- CORRECTED LOOP START ---
          runlistNumbers.forEach((num, idx) => {
            const entry = allHymnsData['English']?.[num] || {};
            const title = entry.title || 'Unknown';
            const li = document.createElement('li');
            li.textContent = `${num} - ${title}`;
            li.dataset.index = idx;

            // Simplified listener using the new function
            li.addEventListener('click', function () {
              loadRunlistIndex(idx);
            });

            runlistDisplay.appendChild(li);
          });
          // --- CORRECTED LOOP END ---

          runlistDisplay.querySelector('li')?.classList.add('active');

          $('pageHeader').textContent = `Hymn ${currentHymnNumber} - ${firstEntry.title || 'Unknown'}`;
          initialHymnLines = firstEntry.lines || [];
          lines = [...initialHymnLines];
          usingCustomLyrics = false;

          const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
          const saved = customLyricsStore[hymnKey];
          $('customLyricsTextarea').value = saved ? saved.join('\n') : '';
          updateLiveCounter();

          $('introLength').value = firstEntry?.intro_length !== undefined ? parseFloat(firstEntry.intro_length).toFixed(1) : 5;
          initializeAudio(currentHymnNumber);

          renderLanguageList();
          updateLanguageSettings();   // ← now after hymn loaded
          
          analyzeVerses(); 
					renderVerseSelection();
        } else {
          if (runlistPanel) runlistPanel.style.display = 'none';
        }
      } else {
        console.log("InitializePage .then(): Processing single hymn...");
        if (runlistPanel) runlistPanel.style.display = 'none';
        currentHymnNumber = params.get("n");

        if (currentHymnNumber && allHymnsData['English']?.[currentHymnNumber]) {
          hymnDataLoaded = true;
          usingCustomLyrics = false;
          const entry = allHymnsData['English'][currentHymnNumber];
          initialHymnLines = entry?.lines || [];

          const customLinesForHymn = customLyricsStore[currentHymnNumber];
          if (customLinesForHymn) {
            lines = customLinesForHymn;
            usingCustomLyrics = true;
            $('customLyricsTextarea').value = customLinesForHymn.join('\n');
          } else {
            lines = [...initialHymnLines];
            usingCustomLyrics = false;
            $('customLyricsTextarea').value = '';
          }

          const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
          const saved = customLyricsStore[hymnKey];
          $('customLyricsTextarea').value = saved ? saved.join('\n') : '';
          updateLiveCounter();

          $('pageHeader').textContent = `Hymn ${currentHymnNumber} - ${entry?.title || 'Unknown'}`;
          $('introLength').value = entry?.intro_length !== undefined ? parseFloat(entry.intro_length).toFixed(1) : 5;
          initializeAudio(currentHymnNumber);

          renderLanguageList();
          updateLanguageSettings();   // ← now after hymn loaded
        } else {
          currentHymnNumber = null;
          lines = [];
          initialHymnLines = [];
          $('pageHeader').textContent = "No Hymn Selected";
          $('introLength').value = 5;
        }
      }
    } catch (hymnLoadError) {
      console.error("Error processing hymn data:", hymnLoadError);
      showNotice("Error loading hymn details.");
      currentHymnNumber = null;
      lines = [];
      initialHymnLines = [];
      if (runlistPanel) runlistPanel.style.display = 'none';
      $('pageHeader').textContent = "Error Loading Hymn";
      enablePlaybackControls(false, false, false);
    }

    try {
      populateLyricsContainer();
      updateLineCountDisplay();
    } catch (e) {
      console.error("Error populating lyrics:", e);
      showNotice("Error displaying lyrics.");
    }

    try {
      console.log("InitializePage .then(): Setting up event listeners...");
      const liveUpdateControls = ['bgColor', 'highlightColor', 'underlineColor', 'dotColor', 'transitionSpeed'];
      liveUpdateControls.forEach(id => {
        if ($(id)) $(id).addEventListener('input', () => {
          applySettings(getSettingsFromForm());
          saveSettings();
        });
      });

      $('toggleUnderlineLabel')?.addEventListener('click', () => {
        const settings = getSettingsFromForm();
        settings.showUnderline = !settings.showUnderline;
        applySettings(settings);
        saveSettings();
        updateFormFromSettings(settings);
      });

      $('applyWidthBtn')?.addEventListener('click', () => {
        applySettings(getSettingsFromForm());
        saveSettings();
      });

      $('trackType')?.addEventListener('change', switchAudioTrack);

      $('resetButton')?.addEventListener('click', () => {
        if (confirm('Reset colors, sizes, and layout to defaults? \n\n(Your Lyric Order and Custom Lyrics will be kept.)')) {
          
          // 1. Create a "Target" settings object based on Defaults
          // We use JSON parse/stringify to get a clean copy of the DEFAULTS object
          const targetSettings = JSON.parse(JSON.stringify(DEFAULTS));

          // 2. Update the visible Form Inputs to match these defaults
          // This function (already in your code) sets the input values and updates the color swatches
          updateFormFromSettings(targetSettings);
          
          // Manual check for the Progress Bar toggle (in case updateFormFromSettings misses it)
          const progBar = $('progressBarToggle');
          if (progBar) progBar.checked = targetSettings.showProgressBar !== false;

          // 3. Apply these settings to the Live View immediately
          // This updates the CSS variables so you see the change instantly
          applySettings(targetSettings);

          // 4. Save to Local Storage
          // saveSettings() reads the *current* form values (which we just reset) 
          // and combines them with your *existing* languageOrder/Lyrics (which we didn't touch).
          saveSettings();

          showNotice("Colors and sizes reset to defaults.");
        }
      });

      $('loadCustomLyricsBtn')?.addEventListener('click', loadCustomLyrics);
      $('loadExcelBtn')?.addEventListener('click', loadExcelLyrics);
      $('customLyricsTextarea')?.addEventListener('input', updateLiveCounter);

      $('customLyricsTextarea')?.addEventListener('input', () => {
        const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
        const newText = $('customLyricsTextarea').value;
        const newLines = newText.split('\n').filter(l => l.trim() !== '');

        if (newLines.length === 0) {
          delete customLyricsStore[hymnKey];
          usingCustomLyrics = false;
        } else {
          customLyricsStore[hymnKey] = newLines;
          lines = newLines;
          usingCustomLyrics = true;
        }

        updateLiveCounter();
        renderLanguageList();
        saveSettings();
      });

      $('exitCustomBtn')?.addEventListener('click', () => setView('hymn'));
      $('settings-toggle')?.addEventListener('click', () => toggleCollapsibleById('settings'));
      $('lyric-order-toggle')?.addEventListener('click', () => toggleCollapsibleById('lyric-order'));
      $('playback-toggle')?.addEventListener('click', () => toggleCollapsibleById('playback'));
      $('manualControlOverride')?.addEventListener('change', toggleManualControl);
      $('skipIntro')?.addEventListener('change', () => {
          saveSettings();
      });
			$('autoWidthBtn')?.addEventListener('click', setAutoWidth);
			
			// Ensure default speed on page load
			if (currentSpeed !== 0) {
					currentSpeed = 0;
					calculatePlaybackRate();
					updateTempoUI();
					if (audio) audio.playbackRate = playbackRate;
			}
			
			const verseDelayInput = $('verseDelay');
      if (verseDelayInput) {
          // Function to toggle color
          const updateDelayColor = () => {
              if (parseFloat(verseDelayInput.value) > 0) {
                  verseDelayInput.style.backgroundColor = '#f59e0b'; // Light Yellow
                  verseDelayInput.style.borderColor = '#b45309';     // Darker Yellow Border
              } else {
                  verseDelayInput.style.backgroundColor = '';        // Reset to white
                  verseDelayInput.style.borderColor = '';            // Reset border
              }
          };

          // Run immediately on load (in case settings loaded a value)
          updateDelayColor();

          // Run whenever user types/changes it
          verseDelayInput.addEventListener('input', updateDelayColor);
      }

			const fullscreenBtn = $('fullscreenToggleBtn');
      if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const page = document.querySelector('.page');
            const controls = document.querySelector('.controls-panel');
        
            const isNowFullscreen = page.classList.toggle('fullscreen-active');
            fullscreenBtn.innerHTML = isNowFullscreen ? '&laquo;' : '&raquo;';
        
            // Helper to restore focus if Manual Mode is active
            const restoreFocus = () => {
                if ($('manualControlOverride').checked) {
                    lyricsViewport.focus();
                }
            };

            if (isNowFullscreen) {
                // COLLAPSING — hide immediately
                controls.classList.add('is-hidden');
        
                // Apply settings after grid change
                setTimeout(() => {
                    applySettings(getSettingsFromForm());
                    restoreFocus(); // <--- FIX 1: Restore focus after expanding
                }, 10);
        
            } else {
                // EXPANDING — wait for grid to settle first
                setTimeout(() => {
                    // Now fade it in smoothly (no awkward jump)
                    controls.classList.remove('is-hidden');
        
                    applySettings(getSettingsFromForm());
                    restoreFocus(); // <--- FIX 2: Restore focus after collapsing
                }, 120);
            }
        });
      }

      console.log("InitializePage .then(): Event listeners set up.");
    } catch (e) {
      console.error("Error setting up event listeners:", e);
      showNotice("Warning: Some controls might not work correctly.");
    }

    try {
      // updateAudioLanguageDisplay(); // <-- Removed duplicate
      if (!hymnDataLoaded && !usingCustomLyrics) {
        showNotice("No hymn selected or data found. Please select a hymn or load custom lyrics.");
      }
      updateAudioLanguageDisplay(); // Keep this one
      console.log("InitializePage .then(): Initialization complete.");
    } catch (e) {
      console.error("Error in final checks:", e);
    }
  }).catch(err => {
    console.error("InitializePage --- CRITICAL ERROR ---", err);
    showNotice(`CRITICAL ERROR: ${err.message}. Check console (F12).`);
    $('pageHeader').textContent = "Initialization Failed";
    enablePlaybackControls(false, false, false);
  });
}


function getSettingsFromForm() {
  const settings = {
    bgColor: $('bgColor').value || DEFAULTS.bgColor,
    highlightColor: $('highlightColor').value || DEFAULTS.highlightColor,
    underlineColor: $('underlineColor').value || DEFAULTS.underlineColor,
    dotColor: $('dotColor').value || DEFAULTS.dotColor,
    showDots: true, 
    showUnderline: !$('toggleUnderlineLabel').classList.contains('disabled'),
    
    // --- NEW: Read Progress Bar Toggle ---
    showProgressBar: $('progressBarToggle') ? $('progressBarToggle').checked : DEFAULTS.showProgressBar,
    // -------------------------------------
    
    transitionSpeed: $('transitionSpeed').value || DEFAULTS.transitionSpeed,
    lyricsWidth: $('lyricsWidth').value || DEFAULTS.lyricsWidth,
    skipIntro: $('skipIntro') ? $('skipIntro').checked : false,
    languages: {}
  };
  languageOrder.forEach(lang => {
    const defaults = DEFAULTS.languages[lang] || DEFAULTS.languages.English;
    settings.languages[lang] = {
      fontSize: $(`fontSize-${lang}`)?.value || defaults.fontSize,
      fontColorActive: $(`fontColor-active-${lang}`)?.value || defaults.fontColorActive,
      fontColorInactive: $(`fontColor-inactive-${lang}`)?.value || defaults.fontColorInactive
    };
  });
  return settings;
}

function applySettings(settings) {
  root.style.setProperty('--lyric-bg-color', settings.bgColor);
  root.style.setProperty('--lyric-highlight-color', settings.highlightColor);
  root.style.setProperty('--underline-glow-color', settings.underlineColor);
  root.style.setProperty('--dot-color', settings.dotColor);
  root.style.setProperty('--transition-speed', `${settings.transitionSpeed}s`);
  
  // This handles the actual hiding of dots in the view
  lyricsViewport.classList.toggle('dots-hidden', !settings.showDots);
  
  lyricsViewport.classList.toggle('underline-hidden', !settings.showUnderline);
  lyricsViewport.classList.toggle('progress-bar-hidden', !settings.showProgressBar);
  
  // Keep this one
  const underlineLabel = $('toggleUnderlineLabel');
  if(underlineLabel) underlineLabel.classList.toggle('disabled', !settings.showUnderline);
  
  const pageEl = document.querySelector('.page');
  if (pageEl) {
    if (pageEl.classList.contains('fullscreen-active')) {
      pageEl.style.gridTemplateColumns = '1fr';
    } else {
      pageEl.style.gridTemplateColumns = `${settings.lyricsWidth}px 400px`;
    }
  }

  let topLang = languageOrder.length > 0 ? languageOrder[0] : 'English';
  if (topLang === 'Custom' && !selectedLanguages.includes('Custom')) {
    topLang = languageOrder.find(lang => selectedLanguages.includes(lang)) || 'English';
  }
  const topLangSettings = settings.languages[topLang] || DEFAULTS.languages.English;
  root.style.setProperty('--countdown-color', topLangSettings.fontColorInactive);
  
  languageOrder.forEach(lang => {
    if (settings.languages[lang]) {
      root.style.setProperty(`--lyric-font-size-${lang}`, `${settings.languages[lang].fontSize}rem`);
      root.style.setProperty(`--lyric-font-color-active-${lang}`, settings.languages[lang].fontColorActive);
      root.style.setProperty(`--lyric-font-color-inactive-${lang}`, settings.languages[lang].fontColorInactive);
    }
  });

  // --- POSITIONING LOGIC ---
  lyricsViewport.style.height = ''; 
  const maxFontSize = Math.max(...languageOrder.map(lang => parseFloat(settings.languages[lang]?.fontSize) || 3));
  const singleLineHeightRem = maxFontSize * 2.3; 
  const viewportHeightPx = lyricsViewport.clientHeight;
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const singleLineHeightPx = singleLineHeightRem * rootFontSize;
  const topSpacerPx = (viewportHeightPx * 0.22) - (singleLineHeightPx / 2);
  const bottomSpacerPx = (viewportHeightPx * 0.78) - (singleLineHeightPx / 2);

  const spacers = document.querySelectorAll('.spacer');
  if (spacers.length > 0) {
      spacers[0].style.height = `${topSpacerPx < 0 ? 0 : topSpacerPx}px`;
      if (spacers.length > 1) {
         spacers[spacers.length - 1].style.height = `${bottomSpacerPx < 0 ? 0 : bottomSpacerPx}px`;
      }
  }

  setCurrentIndex(currentIndex, true);

  if (currentIndex === 0) {
    document.querySelectorAll('.lyric-line-group:first-child .lyric-line')
      .forEach(line => {
        const lang = line.className.match(/lyric-line-(\w+)/)[1];
        line.style.color = getComputedStyle(root).getPropertyValue(`--lyric-font-color-inactive-${lang}`).trim();
      });
  }
}

function enablePlaybackControls(isPlaying, isPaused = false, forceDisableAll = false) {
    const hasAudio = !!audio; 
    const canPlay = hasAudio || usingCustomLyrics;

    // Play/Stop Logic
    const playButtonDisabled = forceDisableAll || isPlaying || isPaused || !canPlay;
    const stopButtonDisabled = forceDisableAll || (!isPlaying && !isPaused) || !canPlay;

    $('btnPlay').disabled = playButtonDisabled;
    $('btnStop').disabled = stopButtonDisabled;

    // --- PAUSE BUTTON LOGIC ---
    const pauseBtn = $('btnPauseResume');
    const pauseIcon = $('pauseIcon');
    const pauseText = $('pauseText');

    if (pauseBtn) {
        // Only enable Pause if we are actually Playing OR Paused
        const pauseResumeDisabled = forceDisableAll || (!isPlaying && !isPaused);
        pauseBtn.disabled = pauseResumeDisabled;

        // Reset the look if we are fully stopped
        if (!isPlaying && !isPaused) {
            if(pauseIcon) pauseIcon.innerHTML = '&#9208;'; // Reset to Pause icon
            if(pauseText) pauseText.textContent = 'Pause';
        }
    }

    // Input disabling logic
    const inputsDisabled = isPlaying;
    $('trackType').disabled = inputsDisabled || !hasAudio || forceDisableAll;
    $('introLength').disabled = inputsDisabled || forceDisableAll; 
}

function getHymnTitleFromJSON(hymnNumber) {
  return allHymnsData['English']?.[hymnNumber]?.title || "Hymn";
}

function getHymnFileNameFromHeader(forceOriginal = false) {
  let num;
  if (forceOriginal) {
    num = currentHymnNumber;
  } else {
    const m = $('pageHeader').textContent.match(/Hymn\s+(\d+)/i);
    if (m) num = m[1];
  }
  if (num) {
    const hymnData = allHymnsData['English'][num] || {};
    const displayTitle = hymnData.title || "Hymn";
    return { fileName: num, number: num, title: displayTitle };
  }
  return null;
}

function handlePlayError(err) {
  console.error(`Audio play error: ${err.message}`);
  stopHymn();
}

function clearTimer() {
  if (mainTimer) {
    clearInterval(mainTimer);
    mainTimer = null;
  }
  // We keep this check just to prevent errors if introTimeout exists from old code,
  // but we don't use it in the new logic.
  if (typeof introTimeout !== 'undefined' && introTimeout) {
    clearTimeout(introTimeout);
    introTimeout = null;
  }
}

function pauseHymn() {
  isPlaying = false;
  if (!audio) return;
  audio.pause();
  clearTimer();
  enablePlaybackControls(false, true);
  $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);

  // 1. Freeze Progress Bar
  const currentBar = lyricsContainer.querySelector('.is-current .line-progress-bar');
  if (currentBar) {
      const computedStyle = window.getComputedStyle(currentBar);
      const currentWidth = computedStyle.width; 
      currentBar.style.transition = 'none';
      currentBar.style.width = currentWidth;
  }

  // 2. Freeze Beat Animations (Underlines)
  // Instead of removing the class (which hides them), we pause the animation
  document.querySelectorAll('.beat-segment.is-glowing').forEach(el => {
      el.style.animationPlayState = 'paused';
  });
}

function resumeHymn() {
  // 1. Resume Audio (if it exists)
  if (audio) {
    try {
      audio.play();
      startCounterTick();
    } catch (err) {
      handlePlayError(err);
      return;
    }
  }

  // 2. Update Global State
  isPlaying = true;
  document.querySelectorAll('input, textarea, button').forEach(el => el.blur());
  enablePlaybackControls(true);

  // --- NEW CHECK: Are we paused inside the Countdown? ---
  // If yes, we restart the countdown logic and RETURN.
  // We do NOT start auto-scrolling yet; playHymn() is still waiting 
  // and will trigger the scroll automatically when the countdown finishes.
  if (lyricsViewport.classList.contains('is-counting-down')) {
    console.log("Resuming countdown logic...");
    resumeIntroCountdown();
    return; 
  }

  // 3. Manual Mode Check
  if ($('manualControlOverride').checked) {
    lyricsViewport.focus();
    return;
  }

  // 4. Standard Resume (Auto-Scroll)
  // Recalculate timings to ensure scroll speed is correct
  const hymnEntry = allHymnsData['English']?.[currentHymnNumber];
  let lineTimings = [];
  let defaultSecondsPerLine = 0;

  if (hymnEntry && hymnEntry.line_timings && Array.isArray(hymnEntry.line_timings) && hymnEntry.line_timings.length > 0) {
    lineTimings = hymnEntry.line_timings.map(t => parseFloat(t) || 0.2);
  }

  if (lineTimings.length === 0) {
    if (hymnEntry && hymnEntry.line_time !== undefined && parseFloat(hymnEntry.line_time) > 0) {
      defaultSecondsPerLine = parseFloat(hymnEntry.line_time);
    } else {
      const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
      const introLength = parseFloat($("introLength").value) || 5;
      const currentLen = (usingCustomLyrics ? lines.length : (hymnEntry?.lines?.length || initialHymnLines.length)) || 1;
      
      if (audio && audio.duration > 0) {
        defaultSecondsPerLine = (audio.duration - introLength - offset) / currentLen;
      } else {
        defaultSecondsPerLine = 5;
      }
    }
  }

  if (defaultSecondsPerLine < 0.2) defaultSecondsPerLine = 0.2;

  const targetLen = getMaxLineCount() || 1;
  while (lineTimings.length < targetLen) {
    lineTimings.push(defaultSecondsPerLine);
  }

  startAutoScroll(lineTimings);
}

function switchAudioTrack() {
  if (!currentHymnNumber) return;
  const wasPlaying = isPlaying;
  const currentTime = audio ? audio.currentTime : 0;
  stopHymn(); // Clear old audio
  initializeAudio(currentHymnNumber, wasPlaying, currentTime);
}

function startAutoScroll(lineTimings) {
  console.log(`startAutoScroll called for line ${currentIndex}`);
  clearTimer();
  const totalLines = getMaxLineCount();
  if (!isPlaying || currentIndex >= totalLines) return;
  
  const verseToSkip = currentVerseMap.find(v => v.startIndex === currentIndex && skippedVerseLabels.includes(v.label));
  
  if (verseToSkip) {
      console.log(`Skipping Verse ${verseToSkip.label}. Duration: ${verseToSkip.totalDuration}s`);
      
      // 1. Jump Audio
      if (audio) {
          audio.currentTime += (verseToSkip.totalDuration); 
      }
      
      // 2. Jump Lyric Index
      // We set index to the line AFTER this verse
      setCurrentIndex(verseToSkip.endIndex + 1, true);
      
      // 3. Recursive Call to handle the next line immediately
      // We use a tiny timeout to allow the audio.currentTime to settle
      setTimeout(() => {
          startAutoScroll(lineTimings);
      }, 50);
      return; // STOP execution of the current loop
  }
  
  // --- NEW: VERSE DELAY LOGIC ---
  const verseDelay = parseFloat($('verseDelay').value) || 0;
  
  // 1. Check if we should pause (Only if delay > 0, not on line 0, and not already paused)
  if (verseDelay > 0 && currentIndex > 0 && !hasPausedForCurrentVerse) {
      // 2. Get text to check for "1:", "2:", "V1:", etc.
      let textToCheck = "";
      // Prefer the first selected language to check for markers
      const checkLang = selectedLanguages[0] || 'English';
      
      if (checkLang === 'Custom' && usingCustomLyrics) {
          textToCheck = lines[currentIndex] || "";
      } else {
          textToCheck = allHymnsData[checkLang]?.[currentHymnNumber]?.lines[currentIndex] || "";
      }
      
      // Regex looks for "1:", "2:", "3:", "V1:", "V2:" at start of line
      if (/^(\d+:|V\d+:)/i.test(textToCheck.trim())) {
          console.log(`Verse detected. Pausing for ${verseDelay} seconds.`);
          
          // A. Pause Audio
          if (audio) audio.pause();
          
          // B. Set Flag (so we don't loop forever)
          hasPausedForCurrentVerse = true;
          
          // C. Wait...
          mainTimer = setTimeout(() => {
              console.log("Verse Delay finished. Resuming.");
              if (audio) audio.play();
              // Recursively call this function. 
              // The flag is now true, so it will skip this block and proceed to scroll.
              startAutoScroll(lineTimings); 
          }, verseDelay * 1000);
          
          return; // STOP execution here to create the pause
      }
  }
  // -------------------------------------

  const timings = lineTimings || currentLineTimings;

  // --- 1. Define Variables ---
  let realDelay = 0;
  let realDuration = (timings[currentIndex] || 5) / playbackRate;
  const totalLineDuration = (timings[currentIndex] || 5) / playbackRate;

  // --- 2. SYNC LOGIC (Audio OR Silent) ---
  if (audio && !audio.paused) {
    let cumulativeTimeStart = 0;
    for (let i = 0; i < currentIndex; i++) {
      cumulativeTimeStart += (timings[i] || 5);
    }
    const introLen = parseFloat($("introLength").value) || 0;
    const lineStartAudioTime = introLen + cumulativeTimeStart;
    const lineEndAudioTime = lineStartAudioTime + (timings[currentIndex] || 5);

    const delayAudio = lineStartAudioTime - audio.currentTime;
    realDelay = (delayAudio > 0 ? delayAudio : 0) / playbackRate;

    const startPoint = Math.max(lineStartAudioTime, audio.currentTime);
    const durationAudio = lineEndAudioTime - startPoint;
    realDuration = (durationAudio > 0 ? durationAudio : 0) / playbackRate;
    
    if (realDuration < 0.1 && realDelay <= 0) realDuration = 0.1;

  } else {
    // SILENT MODE SYNC
    const now = Date.now();
    if (!lineStartTimestamp || realDuration === totalLineDuration) {
        lineStartTimestamp = now;
    }
    const timeAlreadyPassed = (now - lineStartTimestamp) / 1000;
    if (timeAlreadyPassed > 0 && timeAlreadyPassed < totalLineDuration) {
        realDuration = totalLineDuration - timeAlreadyPassed;
    }
  }

  const currentLineEl = $(`line-${currentIndex}`);

  if (currentLineEl) {
    // --- 3. SCHEDULE HIGHLIGHT ---
    if (realDelay > 0.05) {
      currentLineEl.classList.remove('is-current');
      setTimeout(() => {
        if (isPlaying && currentIndex === parseInt(currentLineEl.id.split('-')[1])) {
          currentLineEl.classList.add('is-current');
          lineStartTimestamp = Date.now(); 
        }
      }, realDelay * 1000);
    } else {
      currentLineEl.classList.add('is-current');
      if (realDelay <= 0) lineStartTimestamp = Date.now(); 
    }

    // --- 4. BEAT ANIMATIONS ---
    const activeLanguages = languageOrder.filter(lang => selectedLanguages.includes(lang));
    activeLanguages.forEach(lang => {
       const lineText = usingCustomLyrics && lang === 'Custom'
        ? (lines[currentIndex] || '')
        : (allHymnsData[lang]?.[currentHymnNumber]?.lines[currentIndex] || '');
      const isSignLanguage = lang.includes('SL') || (lang === 'Custom' && lineText.includes('|'));
      
      if (isSignLanguage) {
        const lyricLineEl = currentLineEl.querySelector(`.lyric-line-${lang}`);
        const beatElements = lyricLineEl ? lyricLineEl.querySelectorAll('.beat-segment') : [];
        
        if (beatElements.length > 0 && totalLineDuration > 0.5) {
          const timePerBeat = totalLineDuration / beatElements.length;
          const timeElapsed = Math.max(0, totalLineDuration - realDuration);

          beatElements.forEach((beatEl, i) => {
             beatEl.classList.remove('is-glowing');
             beatEl.style.animationPlayState = 'running';
             void beatEl.offsetWidth; 

             const beatStartTime = i * timePerBeat;
             const beatEndTime = (i + 1) * timePerBeat;

             if (beatEndTime <= timeElapsed) return;

             if (beatStartTime <= timeElapsed && beatEndTime > timeElapsed) {
                 const remainingBeatTime = beatEndTime - timeElapsed;
                 setTimeout(() => {
                   if (!isPlaying) return;
                   beatEl.style.setProperty('--beat-duration', `${remainingBeatTime}s`);
                   beatEl.classList.add('is-glowing');
                   setTimeout(() => beatEl.classList.remove('is-glowing'), remainingBeatTime * 1000);
                 }, realDelay * 1000);
             }

             if (beatStartTime > timeElapsed) {
                 const delayUntilBeat = beatStartTime - timeElapsed;
                 setTimeout(() => {
                   if (!isPlaying) return;
                   beatEl.style.setProperty('--beat-duration', `${timePerBeat}s`);
                   beatEl.classList.add('is-glowing');
                   setTimeout(() => beatEl.classList.remove('is-glowing'), timePerBeat * 1000);
                 }, (realDelay * 1000) + (delayUntilBeat * 1000));
             }
          });
        }
      }
    });

    // --- 5. PROGRESS BAR ---
    const progressBar = currentLineEl.querySelector('.line-progress-bar');
    if (progressBar) {
      let startPercentage = 0;
      if (realDelay <= 0.05) {
          const timeElapsed = totalLineDuration - realDuration;
          if (timeElapsed > 0 && totalLineDuration > 0) {
              startPercentage = (timeElapsed / totalLineDuration) * 100;
          }
      }
      progressBar.style.transition = 'none';
      progressBar.style.width = `${startPercentage}%`;
      void progressBar.offsetWidth;
      progressBar.style.transition = `width ${realDuration}s linear ${realDelay}s`;
      progressBar.style.width = '100%';
    }
  }

  // --- 6. SCHEDULE NEXT LINE ---
  mainTimer = setTimeout(() => {
    if (!isPlaying) return;
    if (currentIndex < totalLines - 1) {
      setCurrentIndex(currentIndex + 1, false, false);
      startAutoScroll(timings);
    } else {
      isPlaying = false;
      clearTimer();
      const activeLine = lyricsContainer.querySelector('.is-current');
      if (activeLine) activeLine.classList.remove('is-current');
      document.querySelectorAll('.line-progress-bar').forEach(bar => {
        bar.style.transition = 'none';
        bar.style.width = '0%';
      });
      enablePlaybackControls(false);
    }
  }, (realDelay + realDuration) * 1000);
}

function toggleCollapsibleById(id, forceOpen = null) {
  const header = $(`${id}-toggle`);
  // Correctly map IDs to content elements
  const content = $(id === 'settings' ? 'settings-grid' : (id === 'lyric-order' ? 'lyric-order-grid' : (id === 'playback' ? 'playback-controls' : `${id}-content`))); // Adjust mapping
  const iconSpan = header ? header.querySelector('span') : null; // Get the span directly

  if (!header || !content) {
    console.warn(`Could not find elements for collapsible ID: ${id}. Header: ${header}, Content: ${content}`);
    return;
  }

  let isCollapsed;
  if (forceOpen === true) {
    isCollapsed = false;
  } else if (forceOpen === false) {
    isCollapsed = true;
  } else {
    isCollapsed = content.classList.toggle('is-collapsed');
  }

  content.classList.toggle('is-collapsed', isCollapsed);
  if (iconSpan) { // Target the span element for the icon text
    iconSpan.textContent = isCollapsed ? '▶' : '▼';
  }
}

function adjustViewportHeight() {
  const lyricsContainer = document.getElementById('lyrics-container');
  const lyricsViewport = document.getElementById('lyricsDisplay');

  if (!lyricsContainer || !lyricsViewport) return;

  // Use scrollHeight to get the true, rendered height of all the lyrics
  const contentHeight = lyricsContainer.scrollHeight;

  // Set the viewport's height to match the content.
  // A small bottom padding can prevent the last line from feeling cramped.
  const bottomPadding = 16; // 1rem, adjust if needed

  lyricsViewport.style.height = `${contentHeight + bottomPadding}px`;
}

// Add this entire block to the end of your song.js file

document.addEventListener('DOMContentLoaded', () => {
    const settingsGrid = document.getElementById('settings-grid'); // Static parent
    const jewelPalette = document.getElementById('jewel-tone-palette');

		if (jewelPalette) {
      jewelPalette.classList.add('is-hidden');
    }

    // --- 1. Initialize STATIC pickers ---
    // We only need to do this for pickers that exist on page load
    document.querySelectorAll('.custom-color-picker').forEach(picker => {
        const hiddenInput = picker.querySelector('.color-input-hidden');
        if (hiddenInput && hiddenInput.id) {
            updateColorDisplay(hiddenInput.id);
        }
    });

    // --- 2. Set up DELEGATED listeners for ALL pickers (static and dynamic) ---
    if (settingsGrid) {
					settingsGrid.addEventListener('click', (e) => {
    // Handle clicks on the color display bar
    if (e.target.classList.contains('color-display')) {
        // This makes it active for the jewel palette
        setActiveColorInput(e.target);

        // --- MOVED THIS BLOCK INSIDE ---
        // Show the palette ONLY when the color bar is clicked
        if (jewelPalette) {
            jewelPalette.classList.remove('is-hidden');
        }
        // --- END MOVED BLOCK ---
    }

    // Handle clicks on the edit button
    if (e.target.classList.contains('edit-color-btn')) {
        const inputId = e.target.dataset.for;
        const hiddenInput = document.getElementById(inputId);

        // Find the color display bar associated with this button
        const display = e.target.closest('.custom-color-picker').querySelector('.color-display');
        if (display) {
            // Set this display as the active one
            setActiveColorInput(display);
        }

        // (Palette showing code is NOT here anymore)

        if (hiddenInput) {
            hiddenInput.click(); // Open the native color picker
        }
    }
});
        // Handle input changes (from the native picker)
        settingsGrid.addEventListener('input', (e) => {
            if (e.target.classList.contains('color-input-hidden')) {
                updateColorDisplay(e.target.id);
                // Note: The separate 'input' listeners for apply/save
                // will also fire, which is what we want.
            }
        });
    }

		document.addEventListener('click', (e) => {
        // Find the palette
        const palette = document.getElementById('jewel-tone-palette');
        if (!palette) return; // Exit if palette doesn't exist

        // Check if the click was INSIDE a color picker OR INSIDE the palette itself
        const clickedInsidePicker = e.target.closest('.custom-color-picker');
        const clickedInsidePalette = e.target.closest('#jewel-tone-palette');

        // If the click was NOT inside either, hide the palette
        if (!clickedInsidePicker && !clickedInsidePalette) {
            palette.classList.add('is-hidden');
            // Optional: Also remove the 'active' state from any color display
            document.querySelectorAll('.color-display.active-color-input').forEach(disp => {
                disp.classList.remove('active-color-input');
            });
        }
    });
		

    // 3. Jewel Palette logic (this already uses delegation, so it's fine)
    if (jewelPalette) {
        jewelPalette.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-swatch')) {
                const color = e.target.dataset.color;
                const activeDisplay = document.querySelector('.color-display.active-color-input');
                if (activeDisplay) {
                    const inputId = activeDisplay.dataset.for;
                    const targetInput = document.getElementById(inputId);
                    if (targetInput) {
                        targetInput.value = color;
                        activeDisplay.style.backgroundColor = color;
                        targetInput.dispatchEvent(new Event('input', { 'bubbles': true }));
                    }
                }
            }
        });
    }
});


// Function to update the display bar's background color
function updateColorDisplay(inputId) {
  const input = document.getElementById(inputId);
  const display = document.querySelector(`.color-display[data-for="${inputId}"]`);
  if (input && display) {
    display.style.backgroundColor = input.value;
  }
}

// Function to set the active color input
function setActiveColorInput(displayElement) {
  // First, remove active class from all other displays
  document.querySelectorAll('.color-display').forEach(d => {
    d.classList.remove('active-color-input');
  });
  // Then, add it to the clicked one
  displayElement.classList.add('active-color-input');
}

/**
 * Creates the new custom color picker HTML structure.
 * @param {string} id - The ID for the color input.
 * @param {string} value - The default color value.
 * @returns {string} - The HTML string for the custom color picker.
 */
function createColorPickerHTML(id, value) {
  return `
    <div class="custom-color-picker">
      <div class="color-display" data-for="${id}"></div>
      <button class="edit-color-btn" data-for="${id}" aria-label="Edit Color">&#9998;</button>
      <input type="color" id="${id}" value="${value}" class="color-input-hidden">
    </div>
  `;
}

function initDarkMode() {
  const toggle = $('darkModeToggle');
  if (!toggle) return;

  // Load saved preference
  const saved = localStorage.getItem('darkMode');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (saved === 'true' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark-mode');
    toggle.checked = true;
  }

  // Toggle handler
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'false');
    }
    console.log("Dark mode:", toggle.checked);
  });

  // Respect system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('darkMode')) {
      if (e.matches) {
        document.documentElement.classList.add('dark-mode');
        toggle.checked = true;
      } else {
        document.documentElement.classList.remove('dark-mode');
        toggle.checked = false;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();       // Runs first — finds the toggle correctly
  initializePage();     // Runs second — everything else
});

function updateAudioLanguageDisplay() {
  const audioLangElement = $('audioLanguage');
  if (!audioLangElement) return;

  let topLanguage = languageOrder[0] || 'English';
  if (topLanguage === 'Custom' && languageOrder.length > 1) {
    topLanguage = languageOrder[1];
  }
  if (topLanguage === 'ASL') topLanguage = 'English'; // No ASL audio

  audioLangElement.textContent = `${topLanguage} Music`;
}

// Add this tiny function — it runs every second, even in manual mode
function startCounterTick() {
  clearInterval(window.counterInterval); // Prevent duplicates
  window.counterInterval = setInterval(() => {
    if (audio && !audio.paused) {
      updateCounter();
    }
  }, 100);
}

// song.js (Add this function anywhere, maybe after stopHymn or resetLyrics)

function deleteAllCustomLyrics() {
    if (confirm("Are you sure you want to delete ALL saved Custom Lyrics for every hymn? This cannot be undone.")) {
        customLyricsStore = {}; // Clear the in-memory store
        
        // Remove Custom from active lists if present
        languageOrder = languageOrder.filter(l => l !== 'Custom');
        selectedLanguages = selectedLanguages.filter(l => l !== 'Custom');
        availableLanguages = availableLanguages.filter(l => l !== 'Custom');

        // Immediately update settings, which saves the empty store
        saveSettings(); 
        
        // Clear global lyrics and refresh view
        lines = [...initialHymnLines];
        usingCustomLyrics = false;
        $('customLyricsTextarea').value = '';
        
        // Reload all elements
        renderLanguageList();
        updateLanguageSettings();
        populateLyricsContainer();
        
        showNotice("All custom lyrics deleted and settings saved.");
    }
}

// --- Runlist & Mini Control Logic ---

function playSmart() {
  // If paused and has progress, resume. Otherwise, play from start.
  if (audio && audio.paused && audio.currentTime > 0 && !isPlaying) {
    resumeHymn();
  } else {
    playHymn();
  }
}

function nextSong() {
  if (runlistNumbers.length === 0) return showNotice("Runlist is empty.");
  if (currentRunlistIndex < runlistNumbers.length - 1) {
    loadRunlistIndex(currentRunlistIndex + 1);
  } else {
    showNotice("End of runlist.");
  }
}

function prevSong() {
  if (runlistNumbers.length === 0) return showNotice("Runlist is empty.");
  if (currentRunlistIndex > 0) {
    loadRunlistIndex(currentRunlistIndex - 1);
  } else {
    showNotice("Start of runlist.");
  }
}

function loadRunlistIndex(idx) {
  try {
    stopHymn(); // Stop current playback
    
    const num = runlistNumbers[idx];
    if (!num) return;

    currentRunlistIndex = idx;
    currentHymnNumber = num;
    analyzeVerses(); 
    renderVerseSelection();
    
    // --- NEW: Update the indicator number ---
    const indicator = $('runlistIndicator');
    if (indicator) {
        // Display 1-based index (idx + 1)
        indicator.textContent = idx + 1;
    }
    // ----------------------------------------
    
    const entry = allHymnsData['English']?.[num] || {};
    $('pageHeader').textContent = `Hymn ${num} - ${entry.title || 'Unknown'}`;
    
    initialHymnLines = entry.lines || [];

    // Handle custom lyrics for this hymn
    const customLinesForHymn = customLyricsStore[num];
    if (customLinesForHymn) {
      lines = customLinesForHymn;
      usingCustomLyrics = true;
      $('customLyricsTextarea').value = customLinesForHymn.join('\n');
    } else {
      lines = [...initialHymnLines];
      usingCustomLyrics = false;
      $('customLyricsTextarea').value = '';
    }
    
    if (!customLinesForHymn) {
        const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
        const saved = customLyricsStore[hymnKey];
        if (saved) $('customLyricsTextarea').value = saved.join('\n');
    }

    updateLiveCounter();
    $('introLength').value = entry?.intro_length !== undefined ? parseFloat(entry.intro_length).toFixed(1) : 5;
    
    loadTempoForCurrentHymn();
    populateLyricsContainer();
    updateLineCountDisplay();
    updateAudioLanguageDisplay();
    renderLanguageList();
    updateLanguageSettings();

    const runlistDisplay = $('runlist-display');
    if (runlistDisplay) {
        runlistDisplay.querySelectorAll('li').forEach(l => l.classList.remove('active'));
        const activeLi = runlistDisplay.querySelector(`li[data-index="${idx}"]`);
        if (activeLi) activeLi.classList.add('active');
    }

    initializeAudio(num);
    
  } catch (err) {
    console.error("Error switching hymn:", err);
    showNotice("Error switching hymn: " + err.message);
  }
}


function adjustTempo(change) {
  currentSpeed += change;
  
  if (currentSpeed < -12) currentSpeed = -12;
  if (currentSpeed > 40) currentSpeed = 40;
  
  calculatePlaybackRate();
  saveTempoForCurrentHymn(); 
  updateTempoUI();
  
  // If we are currently counting down, simply force an update of the number immediately
  // The mainTimer loop in startIntroCountdown will handle the math automatically on the next tick
  if (lyricsViewport.classList.contains('is-counting-down') && audio) {
      const introLen = parseFloat($("introLength").value) || 0;
      const remaining = Math.max(0, introLen - audio.currentTime);
      const countdownNumEl = document.querySelector('.countdown-number');
      if (countdownNumEl) {
          countdownNumEl.textContent = Math.ceil(remaining / playbackRate);
      }
  }
}

function calculatePlaybackRate() {
// Old: 1 + (currentSpeed / 100)  -> 1% per step
  // New: 1 + (currentSpeed * 0.05) -> 5% per step
  playbackRate = 1 + (currentSpeed * 0.05);
  
  // Safety floor to prevent audio from stopping or reversing
  if (playbackRate < 0.25) playbackRate = 0.25;
}

function loadTempoForCurrentHymn() {
  const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
  
  // Check our session variable instead of localStorage
  if (sessionSpeedStore[hymnKey] !== undefined) {
    currentSpeed = parseInt(sessionSpeedStore[hymnKey]);
  } else {
    currentSpeed = 0; // Default if we haven't touched this song yet this session
  }
  
  calculatePlaybackRate();
  updateTempoUI();
}

function saveTempoForCurrentHymn() {
  const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
  
  if (currentSpeed === 0) {
    delete sessionSpeedStore[hymnKey]; // Don't store 0s
  } else {
    sessionSpeedStore[hymnKey] = currentSpeed;
  }
  // No localStorage.setItem needed!
}

function resetTempo() {
  const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
  currentSpeed = 0;
  
  // Clear from session store
  delete sessionSpeedStore[hymnKey];
  
  calculatePlaybackRate();
  updateTempoUI();
  if (audio) audio.playbackRate = playbackRate;
}

function updateTempoUI() {
  // 1. Update the Display
  const display = $('tempoDisplay');
  if (display) {
    // Add a plus sign for positive numbers for clarity
    const sign = currentSpeed > 0 ? '+' : '';
    display.textContent = `${sign}${currentSpeed}`;
    
    // --- WARNING LOGIC ---
    if (currentSpeed !== 0) {
      // Modified Speed: Turn Orange
      display.style.backgroundColor = '#f59e0b'; 
      display.style.color = '#000000';
      display.style.fontWeight = 'bold';
      display.title = "Speed modified (0 is default)";
    } else {
      // Default Speed: Reset styles
      display.style.backgroundColor = ''; 
      display.style.color = '';
      display.style.fontWeight = '';
      display.title = "Standard Speed";
    }
  }

  // 2. Update Audio immediately if playing
  if (audio) {
    audio.playbackRate = playbackRate;
  }
}

function getMaxLineCount() {
    let max = 0;
    // Check Custom first if active
    if (usingCustomLyrics && lines) {
        max = lines.length;
    }
    
    // Check all selected languages
    selectedLanguages.forEach(lang => {
        let count = 0;
        if (lang === 'Custom') {
            if (usingCustomLyrics && lines) count = lines.length;
        } else {
            count = allHymnsData[lang]?.[currentHymnNumber]?.lines?.length || 0;
        }
        if (count > max) max = count;
    });
    
    // Fallback to English if everything else fails
    if (max === 0 && initialHymnLines) max = initialHymnLines.length;
    
    return max;
}

function setAutoWidth() {
  const page = document.querySelector('.page');
  if (!page) return;

  const sidebarWidth = 400;          // your second column
  const gap = 24;                    // 1.5rem ≈ 24px (see .page { gap: 1.5rem; })
  const bodyPadding = 32;            // body has 1rem left + 1rem right = 32px total

  const totalWidth = window.innerWidth;

  let lyricsWidth;

  // If we're in fullscreen (controls panel hidden), use almost the full window width
  if (page.classList.contains('fullscreen-active')) {
    lyricsWidth = totalWidth - bodyPadding;
  } else {
    // Normal 2-column mode: window width minus sidebar, gap, and padding
    lyricsWidth = totalWidth - sidebarWidth - gap - bodyPadding;
  }

  // Safety minimum so it never collapses too far
  lyricsWidth = Math.max(500, Math.round(lyricsWidth));

  // Update the field
  $('lyricsWidth').value = lyricsWidth;

  // Apply via settings so everything stays in sync
  const settings = getSettingsFromForm();
  settings.lyricsWidth = String(lyricsWidth);
  applySettings(settings);

  // Persist
  saveSettings();
}

function waitForActualPlayback(audio, thresholdSeconds = 0.05) {
  return new Promise(resolve => {
    // If it's already playing and past the threshold, resolve immediately
    if (audio && !audio.paused && audio.currentTime > thresholdSeconds) {
      return resolve();
    }

    const onTimeUpdate = () => {
      if (audio && !audio.paused && audio.currentTime > thresholdSeconds) {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        resolve();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
  });
}

function setPlayLoading(isLoading) {
    const btn = $('btnPlay');
    if (!btn) return;
    
    if (isLoading) {
        btn.classList.add('loading');
    } else {
        btn.classList.remove('loading');
    }
}

function resumeIntroCountdown() {
  const countdownEl = $('countdown-display');
  const countdownNumEl = countdownEl.querySelector('.countdown-number');
  const introLen = parseFloat($("introLength").value) || 0;
  // This target time matches the one in startIntroCountdown (stop 3s early)
  const targetAudioTime = Math.max(0, introLen - 3 * playbackRate);

  clearTimer(); // Clear any existing interval

  mainTimer = setInterval(() => {
    if (!audio || audio.paused) return;

    const currentTime = audio.currentTime;
    const remainingTime = introLen - currentTime;

    // Update the big number
    const secondsLeft = Math.ceil(remainingTime / playbackRate);
    if (secondsLeft > 0 && countdownNumEl) {
      countdownNumEl.textContent = secondsLeft;
    }

    // Check if we reached the end of the countdown
    if (currentTime >= targetAudioTime) {
      clearTimer();
      
      // Hide the countdown overlay
      if (countdownEl) countdownEl.classList.remove('is-visible');
      if (lyricsViewport) {
        lyricsViewport.classList.remove('is-counting-down');
        // Immediately reveal lyrics
        lyricsViewport.classList.remove('intro-active');
      }

      // CRITICAL: Resolve the original Promise that playHymn is waiting for
      if (window.introResolver) {
        window.introResolver();
        window.introResolver = null; // Clean up
      }
    }
  }, 100);
}

/* --- VERSE SKIPPING LOGIC --- */

function analyzeVerses() {
    currentVerseMap = [];
    const hymnEntry = allHymnsData['English']?.[currentHymnNumber];
    if (!hymnEntry || !hymnEntry.lines) return;

    // Use raw JSON timings for accurate skipping
    const rawTimings = hymnEntry.line_timings || []; 
    
    // If no raw timings, we can't accurately skip audio, so we might need fallback logic
    // but for now, we assume rawTimings exist as per your description.
    
    let currentBlock = null;

    hymnEntry.lines.forEach((line, index) => {
        // Regex to find start of verse (e.g., "1:", "2:", "Ch:", "V1:")
        const match = line.match(/^(\d+:|Ch:|Chorus:|Bridge:|V\d+:)/i);
        
        if (match) {
            // Close previous block
            if (currentBlock) {
                currentVerseMap.push(currentBlock);
            }
            
            // Start new block
            currentBlock = {
                label: match[1], // "1:", "Ch:", etc.
                startIndex: index,
                endIndex: index,
                totalDuration: parseFloat(rawTimings[index] || 0)
            };
        } else {
            // Continuation of current block
            if (currentBlock) {
                currentBlock.endIndex = index;
                currentBlock.totalDuration += parseFloat(rawTimings[index] || 0);
            } else {
                // Handling lines before the first labeled verse (rare, but possible)
                currentBlock = {
                    label: "Intro/Start",
                    startIndex: index,
                    endIndex: index,
                    totalDuration: parseFloat(rawTimings[index] || 0)
                };
            }
        }
    });

    // Push the final block
    if (currentBlock) {
        currentVerseMap.push(currentBlock);
    }
    
    console.log("Verse Map Analyzed:", currentVerseMap);
}

function renderVerseSelection() {
    const panel = $('verse-selection-panel');
    const container = $('verse-selection-content');
    
    if (!currentVerseMap.length || !currentHymnNumber) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    container.innerHTML = '';

    // Retrieve saved skips for this specific song
    const savedSkips = JSON.parse(localStorage.getItem('skippedVersesStore') || '{}');
    skippedVerseLabels = savedSkips[currentHymnNumber] || [];

    currentVerseMap.forEach((verse, idx) => {
        // Don't show "Intro/Start" unlabeled blocks usually, unless you want to
        if(verse.label === "Intro/Start") return;

        const div = document.createElement('div');
        div.className = 'checkbox-group';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `verse-check-${idx}`;
        checkbox.dataset.label = verse.label;
        
        // CHECKED means PLAY. UNCHECKED means SKIP.
        // If label is in skippedVerseLabels, it should be UNCHECKED.
        checkbox.checked = !skippedVerseLabels.includes(verse.label);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Removed from skip list (Play it)
                skippedVerseLabels = skippedVerseLabels.filter(l => l !== verse.label);
            } else {
                // Add to skip list
                if (!skippedVerseLabels.includes(verse.label)) {
                    skippedVerseLabels.push(verse.label);
                }
            }
            
            // Save to storage
            const store = JSON.parse(localStorage.getItem('skippedVersesStore') || '{}');
            store[currentHymnNumber] = skippedVerseLabels;
            localStorage.setItem('skippedVersesStore', JSON.stringify(store));

            // Re-render lyrics to show/hide "(Skip)" text
            populateLyricsContainer();
        });

        const label = document.createElement('label');
        label.htmlFor = `verse-check-${idx}`;
        label.textContent = `Verse ${verse.label.replace(':', '')}`;

        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
    });
    
    // Wire up the toggle click
    const toggleBtn = $('verse-selection-toggle');
    // Remove old listener to avoid duplicates
    const newBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
    
    newBtn.addEventListener('click', () => {
        toggleCollapsibleById('verse-selection-content'); 
        // Note: You might need to adjust toggleCollapsibleById to handle div IDs directly 
        // or just use the logic inline:
        const c = $('verse-selection-content');
        const isCollapsed = c.classList.toggle('is-collapsed');
        const icon = $('verse-selection-icon');
        if(icon) icon.textContent = isCollapsed ? '▶' : '▼';
    });
}
function fadeInAudio(audioObj, duration = 2000) {
    if (!audioObj) return;
    audioObj.volume = 0; // Start silent
    
    const interval = 50; // Update every 50ms
    const step = interval / duration; // Amount to increase volume per step
    
    const fadeTimer = setInterval(() => {
        // Safety check: if audio stopped or paused, stop fading
        if (!audioObj || audioObj.paused) {
            clearInterval(fadeTimer);
            // Reset volume for next time if we stopped mid-fade
            if(audioObj) audioObj.volume = 1.0; 
            return;
        }
        
        if (audioObj.volume + step >= 1) {
            audioObj.volume = 1;
            clearInterval(fadeTimer);
        } else {
            audioObj.volume += step;
        }
    }, interval);
}

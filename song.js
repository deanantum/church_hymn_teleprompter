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
let isPlaying = false;
let availableLanguages = [];
let selectedLanguages = [];
let languageOrder = [];
let activeColorInput = null;
let runlistNumbers = [];
let currentRunlistIndex = 0;


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
  highlightColor: '#fef08a',
  underlineColor: '#f59e0b',
  dotColor: '#d81b60',
  showDots: true,
  showUnderline: true,
  transitionSpeed: '0.5',
  lyricsWidth: '700',
  languages: {
    English: { fontSize: '3', fontColorActive: '#000000', fontColorInactive: '#4b5563' },
    Spanish: { fontSize: '3', fontColorActive: '#1e88e5', fontColorInactive: '#8ab4f8' },
    ASL: { fontSize: '3', fontColorActive: '#d81b60', fontColorInactive: '#f48fb1' },
    Custom: { fontSize: '3', fontColorActive: '#000000', fontColorInactive: '#4b5563' }
  }
};

function saveSettings() {
    const settings = getSettingsFromForm();
    settings.languageOrder = [...languageOrder];
		settings.selectedLanguages = [...selectedLanguages];
		settings.customLyricsStore = customLyricsStore;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

  const showDots = settings.showDots !== false;
  const showUnderline = settings.showUnderline !== false;
  $('toggleDotLabel').classList.toggle('disabled', !showDots);
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
  if (event.code === 'Space' && !isTyping) {
    event.preventDefault();
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

  if (isManual) {
    lyricsViewport.focus(); // Set focus to receive key events
    $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys); // Remove first to be safe
    $('lyricsDisplay').addEventListener('keydown', handleArrowKeys);
    console.log("Manual mode ENABLED, added keydown listener.");

    // ----> ADD THIS BLOCK <----
    // If we are enabling manual mode WHILE audio is playing (and potentially auto-scrolling),
    // stop the auto-scroll timer.
    if (isPlaying && mainTimer) { // Check if isPlaying and if a timer exists
      console.log("Manual mode enabled during playback: Stopping auto-scroll timer.");
      clearTimer(); // Stop the automatic advancement
    }
    // ----> END OF ADDED BLOCK <----

    // Set isPlaying if entering manual mode when not already playing
    if (!isPlaying) {
        console.log("Setting isPlaying = true for manual control.");
        isPlaying = true; // Allow index advancement via arrow key
    }

  } else {
    // Manual mode is being turned OFF
    $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
    console.log("Manual mode DISABLED, removed keydown listener.");

    // If we were playing audio and switch manual OFF, restart auto-scroll
    if (isPlaying && audio && !audio.paused) {
        console.log("Restarting auto-scroll after disabling manual mode.");
        clearTimer(); // Stop any pending manual timer edge cases

        const hymnEntry = allHymnsData['English']?.[currentHymnNumber]; // Use optional chaining
        if (hymnEntry) {
            let lineTimings = [];
            let defaultSecondsPerLine = 0;
            // Recalculate timings (ensure audio.duration is valid)
            if (hymnEntry.line_timings && Array.isArray(hymnEntry.line_timings) && hymnEntry.line_timings.length > 0) {
                 lineTimings = hymnEntry.line_timings.map(t => parseFloat(t) || 0.2);
            }
             if (lineTimings.length === 0 && hymnEntry.line_time !== undefined && parseFloat(hymnEntry.line_time) > 0) {
                defaultSecondsPerLine = parseFloat(hymnEntry.line_time);
            } else if (lineTimings.length === 0 && audio && audio.duration > 0) { // Check audio exists and has duration
                const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
                const introLength = parseFloat($("introLength").value);
                 const currentLyricsLength = (usingCustomLyrics ? lines : initialHymnLines).length;
                 if (currentLyricsLength > 0 && (audio.duration - introLength - offset) > 0) { // Ensure positive duration remaining
                     defaultSecondsPerLine = (audio.duration - introLength - offset) / currentLyricsLength;
                 } else {
                     defaultSecondsPerLine = 5; // Fallback
                 }
            } else {
                 defaultSecondsPerLine = 5; // General fallback
            }

            if (defaultSecondsPerLine < 0.2) defaultSecondsPerLine = 0.2;
             const targetLineCount = (usingCustomLyrics ? lines : initialHymnLines).length;
            while (lineTimings.length < targetLineCount) {
                lineTimings.push(defaultSecondsPerLine);
            }
            lineTimings = lineTimings.slice(0, targetLineCount);

            startAutoScroll(lineTimings); // Restart autoscroll
        } else {
             console.warn("Cannot restart autoscroll: hymnEntry not found for:", currentHymnNumber);
        }
    } else {
        // If exiting manual mode and audio wasn't playing or doesn't exist.
        // Update isPlaying based on actual audio state ONLY IF audio exists.
         isPlaying = !!(audio && !audio.paused); // Set isPlaying strictly based on audio state
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
  langList.innerHTML = ''; // Clear existing content
  languageOrder.forEach(lang => {
    let lineCount = (lang === 'Custom' && usingCustomLyrics)
    ? lines.length
    : allHymnsData[lang]?.[currentHymnNumber]?.lines?.length || 0;
    
    if (lineCount === 0 && lang !== 'Custom') return;
    if (lineCount === 0) return;  // skip Custom if empty
    // Create elements programmatically to avoid whitespace
    
    // --- 1. LI setup ---
    const li = document.createElement('li');
    li.className = 'language-item';
    li.draggable = true;
    li.dataset.lang = lang;
    
    // Set LI to display elements horizontally and push content apart
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between'; 
    li.style.alignItems = 'center';

    // --- 2. Checkbox Group DIV ---
    const div = document.createElement('div');
    div.className = 'checkbox-group';
    
    // --- 3. Input Element ---
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `lang-${lang}`;
    if (selectedLanguages.includes(lang)) {
      input.checked = true;
    }
    
    // --- 4. Label Element (MISSING CREATION IN YOUR CODE) ---
    const label = document.createElement('label'); // <-- ADD THIS LINE
    label.htmlFor = `lang-${lang}`;
    label.textContent = `${lang} (Lines: ${lineCount})`;

    // --- 5. APPEND INPUTS/LABEL TO DIV ---
    div.appendChild(input); 
    div.appendChild(label); // <-- ADD THESE LINES

    // --- 6. Remove Button Setup ---
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '❌';
    removeBtn.className = 'remove-language-btn';
    removeBtn.title = `Remove ${lang} from the Lyric Order`;
    removeBtn.type = 'button'; 
    removeBtn.dataset.lang = lang; 
    
    // Inline style for smaller size and padding
    removeBtn.style.fontSize = '0.7em';
    removeBtn.style.padding = '0.1rem 0.3rem';
    removeBtn.style.marginLeft = '1rem'; // Space it away from the text
    removeBtn.style.backgroundColor = 'transparent';
    removeBtn.style.border = 'none';
    removeBtn.style.cursor = 'pointer';
    
    removeBtn.addEventListener('click', deleteLanguageFromOrder);
    
    // --- 7. APPEND DIV AND BUTTON TO LI ---
    li.appendChild(div); // Checkbox group (left side)
    li.appendChild(removeBtn); // Remove button (right side)
    langList.appendChild(li);

    console.log('Generated language-item HTML:', li.outerHTML); // Debug
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
        let timingLanguage = languageOrder[0] === 'Custom' ? languageOrder[1] : languageOrder[0];
        timingLanguage = timingLanguage?.includes('SL') ? 'English' : timingLanguage;
        const hymnEntry = allHymnsData[timingLanguage]?.[currentHymnNumber] || allHymnsData['English']?.[currentHymnNumber];
        if (hymnEntry) {
          let lineTimings = (hymnEntry.line_timings || []).map(t => parseFloat(t) || 0.2);
          const targetLineCount = usingCustomLyrics ? lines.length : (hymnEntry.lines?.length || 0);
          let defaultSecondsPerLine = 5;
          if (lineTimings.length < targetLineCount) {
            const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
            if (audio && audio.duration > 0) {
              defaultSecondsPerLine = (audio.duration - parseFloat($("introLength").value) - offset) / targetLineCount;
            }
          }
          while (lineTimings.length < targetLineCount) {
            lineTimings.push(defaultSecondsPerLine);
          }
          startAutoScroll(lineTimings);
        }
      }
    });
item.querySelector('input').addEventListener('change', (e) => {
    const lang = item.dataset.lang;
    const isChecked = e.target.checked;

    if (isChecked) {
        // --- Trying to ADD a language ---
        if (!selectedLanguages.includes(lang)) {
            if (selectedLanguages.length < 3) {
                selectedLanguages.push(lang); // Add the new language
            } else {
                // Too many languages selected, prevent checking this one
                e.target.checked = false; // Revert the check immediately
                showNotice("Maximum 3 languages can be selected.");
                return; // Stop processing this event
            }
        }
    } else {
        // --- Trying to REMOVE a language ---
        // Just remove it, no minimum check needed anymore
        selectedLanguages = selectedLanguages.filter(l => l !== lang);
    }

    // --- Update everything based on the new selectedLanguages array ---
    saveSettings();
    updateLanguageSettings(); // Rebuilds the settings UI section
    populateLyricsContainer(); // Reloads lyrics (will be empty if none selected)
    updateAudioLanguageDisplay(); // Updates which audio track might play
});
  });
}

function updateLanguageSettings() {
    const langSettingsDiv = $('language-settings');

    if (!langSettingsDiv) {
        console.error("FATAL: Could not find #language-settings div. Settings UI cannot be built.");
        showNotice("Error: UI element missing (#language-settings). Settings cannot be displayed.");
        return;
    }

    langSettingsDiv.innerHTML = ''; // Clear previous content safely

    const settings = loadSettings() || {}; // Load current settings once

    languageOrder.forEach(lang => {
        if (!selectedLanguages.includes(lang)) return;

        // --- Get settings for this language ---
        const currentLangSettings = settings.languages?.[lang] || DEFAULTS.languages[lang] || DEFAULTS.languages['English'];
        const activeColorValue = currentLangSettings.fontColorActive;
        const inactiveColorValue = currentLangSettings.fontColorInactive;

        const langGroupDiv = document.createElement('div');
        langGroupDiv.className = 'control-group language-control-group';

        // 1. Create Language Label
        const langLabel = document.createElement('label');
        const strongTag = document.createElement('strong');
        const uTag = document.createElement('u');
        uTag.textContent = lang;
        strongTag.appendChild(uTag);
        langLabel.appendChild(strongTag);
        langGroupDiv.appendChild(langLabel);

        // 2. Create Control Row div
        const controlRow = document.createElement('div');
        controlRow.className = 'control-row';

        // 3. Create Font Color Subgroup
        const colorSubgroup = document.createElement('div');
        colorSubgroup.className = 'control-subgroup';
        const colorLabel = document.createElement('label');
        colorLabel.textContent = 'Font Color';
        colorSubgroup.appendChild(colorLabel);

        const dualPicker = document.createElement('div');
        dualPicker.className = 'dual-color-picker';

        // --- Active Color (NEW) ---
        const activeColorGroup = document.createElement('div');
        activeColorGroup.className = 'control-subgroup';
        const activeLabel = document.createElement('label');
        activeLabel.htmlFor = `fontColor-active-${lang}`;
        activeLabel.textContent = 'Active';
        
        // Use the HTML template function
        activeColorGroup.appendChild(activeLabel);
        activeColorGroup.innerHTML += createColorPickerHTML(`fontColor-active-${lang}`, activeColorValue);
        dualPicker.appendChild(activeColorGroup);

        // --- Inactive Color (NEW) ---
        const inactiveColorGroup = document.createElement('div');
        inactiveColorGroup.className = 'control-subgroup';
        const inactiveLabel = document.createElement('label');
        inactiveLabel.htmlFor = `fontColor-inactive-${lang}`;
        inactiveLabel.textContent = 'Inactive';
        
        // Use the HTML template function
        inactiveColorGroup.appendChild(inactiveLabel);
        inactiveColorGroup.innerHTML += createColorPickerHTML(`fontColor-inactive-${lang}`, inactiveColorValue);
        dualPicker.appendChild(inactiveColorGroup);

        colorSubgroup.appendChild(dualPicker);
        controlRow.appendChild(colorSubgroup);

        // 4. Create Font Size Subgroup
        const sizeSubgroup = document.createElement('div');
        sizeSubgroup.className = 'control-subgroup';
        const sizeLabel = document.createElement('label');
        sizeLabel.htmlFor = `fontSize-${lang}`;
        sizeLabel.textContent = 'Font Size: ';
        sizeSubgroup.appendChild(sizeLabel);

        const sizeInputGroup = document.createElement('div');
        sizeInputGroup.className = 'input-group';

        const decreaseBtn = document.createElement('button');
        decreaseBtn.className = 'btn';
        decreaseBtn.style.cssText = "background-color: #ADD8E6; border: 1px solid #d1d5db; border-right: none; border-top-left-radius: 8px; border-bottom-left-radius: 8px; width: 2.5rem;";
        decreaseBtn.textContent = '-';
        decreaseBtn.onclick = () => decreaseFontSize(lang); // Use arrow function

        const sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.id = `fontSize-${lang}`;
        sizeInput.className = 'form-control';
        sizeInput.min = "0.1";
        sizeInput.max = "20";
        sizeInput.step = "0.1";
        sizeInput.style.cssText = "width: 5rem; text-align: center; border-radius: 0; margin: 0; padding: 0.4rem;";

        const increaseBtn = document.createElement('button');
        increaseBtn.className = 'btn';
        increaseBtn.style.cssText = "background-color: #ADD8E6; border: 1px solid #d1d5db; border-left: none; border-top-right-radius: 8px; border-bottom-right-radius: 8px; width: 2.5rem;";
        increaseBtn.textContent = '+';
        increaseBtn.onclick = () => increaseFontSize(lang); // Use arrow function

        sizeInputGroup.appendChild(decreaseBtn);
        sizeInputGroup.appendChild(sizeInput);
        sizeInputGroup.appendChild(increaseBtn);
        sizeSubgroup.appendChild(sizeInputGroup);
        controlRow.appendChild(sizeSubgroup);

        // 5. Append control row and the whole language group
        langGroupDiv.appendChild(controlRow);
        langSettingsDiv.appendChild(langGroupDiv);

        // --- NEW: Initialize the new display colors ---
        // (Must be called *after* elements are appended to the DOM)
        updateColorDisplay(`fontColor-active-${lang}`);
        updateColorDisplay(`fontColor-inactive-${lang}`);

        // 6. Set values and add listeners (NOW that elements are in the DOM)
        // --- Find the NEWLY created inputs ---
        const activeInput = $(`fontColor-active-${lang}`); // This ID is on the <input>
        const inactiveInput = $(`fontColor-inactive-${lang}`); // This ID is on the <input>
        // const sizeInput = $(`fontSize-${lang}`); // Already defined above, re-use it

        // Set font size value (color values were set by createColorPickerHTML)
        sizeInput.value = parseFloat(currentLangSettings.fontSize || '3').toFixed(1);

        // This listener block is correct and attaches to the hidden inputs
        [activeInput, inactiveInput, sizeInput].forEach(input => {
            if (input) { // Add a check in case an element isn't found
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
    const langToRemove = event.currentTarget.dataset.lang;

    if (!confirm(`Are you sure you want to remove '${langToRemove}' from the Lyric Order? This will reset custom settings related to this language.`)) {
        return;
    }

    // 1. Remove from Order list
    languageOrder = languageOrder.filter(l => l !== langToRemove);

    // 2. Remove from Selection list
    selectedLanguages = selectedLanguages.filter(l => l !== langToRemove);

    // 3. Special handling for 'Custom' lyrics (permanently delete data)
    if (langToRemove === 'Custom') {
        // Find all keys in the store that start with a number (hymn numbers)
        Object.keys(customLyricsStore).forEach(key => {
            if (!isNaN(parseInt(key))) {
                delete customLyricsStore[key];
            }
        });
        // Also delete the 'CUSTOM_ONLY' key if it exists
        delete customLyricsStore['CUSTOM_ONLY'];
        
        // Remove 'Custom' from available languages list (if present)
        availableLanguages = availableLanguages.filter(l => l !== 'Custom');

        // Reset the active lyrics view if it was using custom lyrics for the current song
        if (usingCustomLyrics) {
            const currentHymnKey = currentHymnNumber || 'CUSTOM_ONLY';
            if (!customLyricsStore[currentHymnKey]) {
                // Fall back to original lyrics/empty state
                lines = [...initialHymnLines];
                usingCustomLyrics = false;
                $('customLyricsTextarea').value = '';
            }
        }
    }
    
    // Ensure we always have at least one language selected (if available)
    if (selectedLanguages.length === 0 && languageOrder.length > 0) {
        selectedLanguages.push(languageOrder[0]);
    }

    // 4. Save and Update UI
    saveSettings(); 
    renderLanguageList();
    updateLanguageSettings();
    populateLyricsContainer();
    updateAudioLanguageDisplay();

    showNotice(`'${langToRemove}' removed from order. Settings saved.`);
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
    enablePlaybackControls(isPlaying, audio && audio.paused && !isPlaying, false); // Update controls based on state
    
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
  }
  
  updateLiveCounter();
  renderLanguageList();
  saveSettings();
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
  $('introLength').value = allHymnsData['English']?.[currentHymnNumber]?.intro_length !== undefined ? parseFloat(allHymnsData['English'][currentHymnNumber].intro_length).toFixed(1) : 5;
  setView('hymn');
  loadAvailableLanguages().then(() => {
    renderLanguageList();
    updateLanguageSettings();
  });
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
    let maxLines = 0;

    if (usingCustomLyrics) {
        maxLines = lines.length;  // Custom is the source of truth
    } else {
        // Normal hymn mode — find longest language
        selectedLanguages.forEach(lang => {
            const count = allHymnsData[lang]?.[currentHymnNumber]?.lines?.length || 0;
            if (count > maxLines) maxLines = count;
        });
    }

    for (let index = 0; index < maxLines; index++) {
        const div = document.createElement('div');
        div.className = 'lyric-line-group';
        div.id = `line-${index}`;
        languageOrder.forEach(lang => {
            if (!selectedLanguages.includes(lang)) return;
						
						let lineText = '';
						
            if (lang === 'Custom' && usingCustomLyrics) {
						lineText = (lines[index] || '').replace(/-/g, '\u2011');
						}
						// If NOT using custom lyrics OR if it is a standard language (English, Spanish, ASL)
						// we show the standard lyrics, unless custom is active and we want to prevent overlap.
						else if (allHymnsData[lang]?.[currentHymnNumber]?.lines) {
								// Only display the standard language if:
								// 1. We are NOT using custom lyrics, OR
								// 2. The language is NOT 'Custom' (i.e., display English/ASL alongside Custom)
								if (lang !== 'Custom') {
										lineText = (allHymnsData[lang][currentHymnNumber].lines[index] || '').replace(/-/g, '\u2011');
								} else if (!usingCustomLyrics) {
										// This branch handles standard languages when custom isn't selected/active
										lineText = (allHymnsData[lang][currentHymnNumber].lines[index] || '').replace(/-/g, '\u2011');
								}
						}
            const p = document.createElement('p');
            p.className = `lyric-line lyric-line-${lang}`;
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
                p.textContent = lineText;
            } else if (lang !== 'Custom') {
                 if (index === 0 && !allHymnsData[lang]?.[currentHymnNumber]?.lines) {
                    p.textContent = `${lang} lyrics not available`;
                 }
            }
            if (p.hasChildNodes()) {
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
}

function setCurrentIndex(newIdx, instant = false) {
  const currentLineEl = lyricsContainer.querySelector('.is-current');
  if (currentLineEl) currentLineEl.classList.remove('is-current');
  const lineArray = usingCustomLyrics ? lines : initialHymnLines;
  if (newIdx < 0 || newIdx >= lineArray.length) {
    currentIndex = -1;
    return;
  }
  const nextLineEl = $(`line-${newIdx}`);
  if (!nextLineEl) return;
  const viewportHeight = lyricsViewport.clientHeight;
  const targetScrollTop = nextLineEl.offsetTop - (viewportHeight / 2) + (nextLineEl.offsetHeight / 2);
  if (instant) {
    lyricsContainer.style.transition = 'none';
    lyricsContainer.style.transform = `translateY(-${targetScrollTop}px)`;
    setTimeout(() => {
      lyricsContainer.style.transition = `transform var(--transition-speed) ease-in-out`;
    }, 50);
  } else {
    lyricsContainer.style.transform = `translateY(-${targetScrollTop}px)`;
  }
  nextLineEl.classList.add('is-current');
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
    const countdownEl = $('countdown-display');
    const countdownNumEl = countdownEl.querySelector('.countdown-number');
    let secondsLeft = Math.ceil(duration);
    if (duration <= 3) {
      lyricsViewport.classList.remove('is-counting-down');
      setTimeout(resolve, duration * 1000);
      return;
    }
    lyricsViewport.classList.add('is-counting-down');
    countdownEl.classList.add('is-visible');
    countdownNumEl.textContent = secondsLeft;
    clearTimer();
    mainTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) { countdownNumEl.textContent = secondsLeft; }
      if (secondsLeft === 3) {
        countdownEl.classList.remove('is-visible');
        lyricsViewport.classList.remove('is-counting-down');
      }
      if (secondsLeft <= 0) { clearTimer(); resolve(); }
    }, 1000);
  });
}

function togglePauseResume() {
  if (isPlaying) {
    pauseHymn();
    $('btnPauseResume').innerHTML = '&#9199; Resume';
  } else {
    resumeHymn();
    $('btnPauseResume').innerHTML = '&#9208; Pause';
  }
}

async function initializeAudio(hymnNumber, wasPlaying = false, currentTime = 0, onManualSetup = null) {
  if (!hymnNumber) return console.warn("initializeAudio called with no hymn number.");

  const trackType = $('trackType').checked ? 'voice' : 'accompaniment';
  let topLanguage = languageOrder[0] || 'English';
  if (topLanguage === 'Custom' && languageOrder.length > 1) topLanguage = languageOrder[1];
  if (topLanguage === 'ASL') topLanguage = 'English';

  $('audioLanguage')?.setTextContent?.(`${topLanguage} Music`);

  const hymnEntry = allHymnsData[topLanguage]?.[hymnNumber] || allHymnsData['English']?.[hymnNumber];
  if (!hymnEntry) return forceManualMode("No hymn data");

  let audioURL = trackType === 'voice' ? hymnEntry.voiceURL : hymnEntry.accompanimentURL;

  if (!audioURL?.trim()) {
    const folder = trackType === 'voice' ? 'voice' : 'accompaniment';
    audioURL = `audio/${topLanguage}/${folder}/${hymnNumber}.mp3`;
  }

  console.log(`Loading audio: ${audioURL}`);

  if (audio) { audio.pause(); audio = null; }

  audio = new Audio(audioURL);
  audio.preload = 'metadata';
  audio.currentTime = currentTime;

  audio.onloadedmetadata = () => {
    startCounterTick();
    audio.addEventListener('timeupdate', updateCounter);
    audio.addEventListener('ended', onAudioEnded);
    if ($('manualControlOverride')?.checked) {
      $('manualControlOverride').checked = false;
      toggleManualControl();
    }
    if (wasPlaying) audio.play().catch(handlePlayError);
    enablePlaybackControls(wasPlaying, !wasPlaying && currentTime > 0);
  };

  audio.onerror = () => {
    console.error("Audio failed:", audioURL);
    showNotice(`No ${trackType} audio for ${topLanguage} hymn ${hymnNumber}`);
    audio = null;
    forceManualMode();
    if (onManualSetup) onManualSetup();
  };

  function forceManualMode(msg = "No audio available") {
    audio = null;
    showNotice(`${msg}. Manual Control enabled.`);
    const cb = $('manualControlOverride');
    if (cb && !cb.checked) { cb.checked = true; toggleManualControl(); }
    enablePlaybackControls(false, false, false);
    setCurrentIndex(0, true);
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
    currentIndex = -1;                // ← no line highlighted
    populateLyricsContainer();        // ← all inactive colors
    return;
  }

  // Normal hymn with audio
  console.log(`playHymn: Attempting to initialize audio for Hymn ${currentHymnNumber}...`);
  currentIndex = -1;                  // ← start with NO highlight/active colors
  populateLyricsContainer();          // ← render all lines inactive
  enablePlaybackControls(false, false, false);
  document.querySelectorAll('input, textarea, button').forEach(el => el.blur());

  const introLength = parseFloat($("introLength").value);

  initializeAudio(currentHymnNumber, false, 0, () => {
    isPlaying = true;
    enablePlaybackControls(false, false, true);
  });

  audio.onloadedmetadata = async () => {
    if (introLength >= audio.duration) {
      showNotice("Intro length exceeds audio duration. Playback stopped.");
      stopHymn();
      return;
    }
    updateCounter();
    const hymnEntry = allHymnsData['English']?.[currentHymnNumber] || {};
    let lineTimings = [];
    let defaultSecondsPerLine = 0;
    if (hymnEntry && hymnEntry.line_timings && Array.isArray(hymnEntry.line_timings) && hymnEntry.line_timings.length > 0) {
      lineTimings = hymnEntry.line_timings.map(t => parseFloat(t) || 0.2);
    }
    if (lineTimings.length === 0 && hymnEntry && hymnEntry.line_time !== undefined && parseFloat(hymnEntry.line_time) > 0) {
      defaultSecondsPerLine = parseFloat(hymnEntry.line_time);
    } else if (lineTimings.length === 0) {
      const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
      defaultSecondsPerLine = (audio.duration - introLength - offset) / (hymnEntry?.lines?.length || initialHymnLines.length);
    }
    if (defaultSecondsPerLine < 0.2) defaultSecondsPerLine = 0.2;
    const targetLineCount = usingCustomLyrics ? lines.length : (hymnEntry?.lines?.length || initialHymnLines.length);
    while (lineTimings.length < targetLineCount) {
      lineTimings.push(defaultSecondsPerLine);
    }
    lineTimings = lineTimings.slice(0, targetLineCount);
    const avgSecondsPerLine = lineTimings.reduce((sum, t) => sum + t, 0) / lineTimings.length;
    $('metaSPL').textContent = `Speed: ${avgSecondsPerLine.toFixed(2)}s/line`;

  lyricsViewport.classList.add('intro-active');
  isPlaying = true;
	
	try {
		await audio.play();
		startCounterTick();
		enablePlaybackControls(true);
		await startIntroCountdown(introLength);
	} catch (err) {
		handlePlayError(err);
		return; // stop if play fails
	}

  lyricsViewport.classList.remove('intro-active');
  setCurrentIndex(0);  // now highlight + active colors

  if (!$('manualControlOverride').checked) startAutoScroll(lineTimings);
  else lyricsViewport.focus();
};
}

function stopHymn() {
	clearInterval(window.counterInterval);
  isPlaying = false;
	showNotice('');
  if (audio) { audio.pause(); audio.currentTime = 0; }
  clearTimer();
  document.querySelectorAll('.beat-segment.is-glowing').forEach(el => {
    el.classList.remove('is-glowing');
  });
  $('metaCounter').textContent = "- / -";
  if (!currentHymnNumber) $('audioLanguage').textContent = '';
  $('countdown-display').classList.remove('is-visible');
  lyricsViewport.classList.remove('is-counting-down', 'intro-active');
  enablePlaybackControls(false);
  populateLyricsContainer();
  setTimeout(() => {
    setCurrentIndex(0, true);
    lyricsContainer.style.transform = 'translateY(0px)';
  }, 0);
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
        currentHymnNumber = runlistNumbers[0];
        currentRunlistIndex = 0;
        const firstEntry = allHymnsData['English']?.[currentHymnNumber] || {};

        if (Object.keys(firstEntry).length > 0) {
          hymnDataLoaded = true;
          if (runlistPanel) runlistPanel.style.display = 'block';

          const runlistDisplay = $('runlist-display');
          if (!runlistDisplay) throw new Error("Runlist display element not found!");
          runlistDisplay.innerHTML = '';

          runlistNumbers.forEach((num, idx) => {
            const entry = allHymnsData['English']?.[num] || {};
            const title = entry.title || 'Unknown';
            const li = document.createElement('li');
            li.textContent = `${num} - ${title}`;
            li.dataset.index = idx;

            li.addEventListener('click', function () {
              try {
                stopHymn();
                currentRunlistIndex = idx;
                currentHymnNumber = num;
                const entry = allHymnsData['English']?.[num] || {};
                $('pageHeader').textContent = `Hymn ${num} - ${entry.title || 'Unknown'}`;
                initialHymnLines = entry.lines || [];

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

                const hymnKey = currentHymnNumber || 'CUSTOM_ONLY';
                const saved = customLyricsStore[hymnKey];
                $('customLyricsTextarea').value = saved ? saved.join('\n') : '';
                updateLiveCounter();

                $('introLength').value = entry?.intro_length !== undefined ? parseFloat(entry.intro_length).toFixed(1) : 5;
                populateLyricsContainer();
                updateLineCountDisplay();
                updateAudioLanguageDisplay();
                renderLanguageList();
                updateLanguageSettings();

                runlistDisplay.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                this.classList.add('active');
                initializeAudio(num);
              } catch (err) {
                console.error("Runlist click error:", err);
                showNotice("Error switching hymn: " + err.message);
              }
            });
            runlistDisplay.appendChild(li);
          });

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

      $('toggleDotLabel')?.addEventListener('click', () => {
        const settings = getSettingsFromForm();
        settings.showDots = !settings.showDots;
        applySettings(settings);
        saveSettings();
        updateFormFromSettings(settings);
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
        if (confirm('Reset all settings to default?')) {
          customLyricsStore = {};
          localStorage.removeItem(SETTINGS_KEY);
          location.reload();
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

      console.log("InitializePage .then(): Event listeners set up.");
    } catch (e) {
      console.error("Error setting up event listeners:", e);
      showNotice("Warning: Some controls might not work correctly.");
    }

    try {
      updateAudioLanguageDisplay();
      if (!hymnDataLoaded && !usingCustomLyrics) {
        showNotice("No hymn selected or data found. Please select a hymn or load custom lyrics.");
      }
      updateAudioLanguageDisplay();
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
    showDots: !$('toggleDotLabel').classList.contains('disabled'),
    showUnderline: !$('toggleUnderlineLabel').classList.contains('disabled'),
    transitionSpeed: $('transitionSpeed').value || DEFAULTS.transitionSpeed,
    lyricsWidth: $('lyricsWidth').value || DEFAULTS.lyricsWidth,
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
  lyricsViewport.classList.toggle('dots-hidden', !settings.showDots);
  lyricsViewport.classList.toggle('underline-hidden', !settings.showUnderline);
  $('toggleDotLabel').classList.toggle('disabled', !settings.showDots);
  $('toggleUnderlineLabel').classList.toggle('disabled', !settings.showUnderline);
  document.querySelector('.page').style.gridTemplateColumns = `${settings.lyricsWidth}px 400px`;
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
  const maxFontSize = Math.max(...languageOrder.map(lang => parseFloat(settings.languages[lang]?.fontSize) || 3));
  const singleLineHeightRem = maxFontSize * (1.3 + 1.0);
  const viewportHeightRem = singleLineHeightRem * 3 * selectedLanguages.length;
  lyricsViewport.style.height = `${viewportHeightRem}rem`;
  const spacerHeightRem = (viewportHeightRem / 2) - (singleLineHeightRem / 2);
  document.querySelectorAll('.spacer').forEach(el => {
    el.style.height = `${spacerHeightRem < 0 ? 0 : spacerHeightRem}rem`;
  });
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
    const hasAudio = !!audio; // Use the audio object status
    const playButtonDisabled = forceDisableAll || isPlaying || isPaused || !hasAudio;
    const pauseResumeDisabled = forceDisableAll || (!isPlaying && !isPaused) || !hasAudio;
    const stopButtonDisabled = forceDisableAll || (!isPlaying && !isPaused) || !hasAudio;

    $('btnPlay').disabled = playButtonDisabled;
    $('btnPauseResume').disabled = pauseResumeDisabled;
    $('btnPauseResume').innerHTML = isPlaying ? '&#9208; Pause' : '&#9199; Resume';
    $('btnStop').disabled = stopButtonDisabled;

    // This is your new, simplified logic
    const inputsDisabled = isPlaying;
    $('trackType').disabled = inputsDisabled || !hasAudio || forceDisableAll;
    $('introLength').disabled = inputsDisabled || forceDisableAll; // Added forceDisableAll just in case
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
    clearTimeout(mainTimer);
    mainTimer = null;
  }
}

function pauseHymn() {
  isPlaying = false;
  if (!audio) return;
  audio.pause();
  clearTimer();
  enablePlaybackControls(false, true);
  $('lyricsDisplay').removeEventListener('keydown', handleArrowKeys);
}

function resumeHymn() {
  if (!audio) return;
  const splText = ($('metaSPL').textContent || "").split(': ')[1];
  const spl = splText ? parseFloat(splText) : 0;
  if (isNaN(spl) || spl <= 0) return;
  isPlaying = true;
  document.querySelectorAll('input, textarea, button').forEach(el => el.blur());
  if ($('manualControlOverride').checked) {
    lyricsViewport.focus();
  }
  try {
    audio.play();
		startCounterTick();
  } catch (err) {
    handlePlayError(err);
  }
  enablePlaybackControls(true);
  const hymnEntry = allHymnsData['English'][currentHymnNumber];
  let lineTimings = [];
  let defaultSecondsPerLine = 0;
  if (hymnEntry && hymnEntry.line_timings && Array.isArray(hymnEntry.line_timings) && hymnEntry.line_timings.length > 0) {
    lineTimings = hymnEntry.line_timings.map(t => parseFloat(t) || 0.2);
  }
  if (lineTimings.length === 0 && hymnEntry && hymnEntry.line_time !== undefined && parseFloat(hymnEntry.line_time) > 0) {
    defaultSecondsPerLine = parseFloat(hymnEntry.line_time);
  } else if (lineTimings.length === 0) {
    const offset = parseInt(currentHymnNumber) >= 1000 ? 3 : 5;
    const introLength = parseFloat($("introLength").value);
    defaultSecondsPerLine = (audio.duration - introLength - offset) / (hymnEntry?.lines?.length || initialHymnLines.length);
  }
  if (defaultSecondsPerLine < 0.2) defaultSecondsPerLine = 0.2;
  while (lineTimings.length < (hymnEntry?.lines?.length || initialHymnLines.length)) {
    lineTimings.push(defaultSecondsPerLine);
  }

	if (!$('manualControlOverride').checked) {
			startAutoScroll(lineTimings);
	} else {
			 lyricsViewport.focus(); // Ensure focus if resuming in manual
	}

}

function switchAudioTrack() {
  if (!currentHymnNumber) return;
  const wasPlaying = isPlaying;
  const currentTime = audio ? audio.currentTime : 0;
  stopHymn(); // Clear old audio
  initializeAudio(currentHymnNumber, wasPlaying, currentTime);
}

function startAutoScroll(lineTimings) {
  clearTimer();
  const currentLineArray = usingCustomLyrics ? lines : initialHymnLines;
  if (!isPlaying || currentIndex >= currentLineArray.length) return;
  const secondsForCurrentLine = lineTimings[currentIndex] || 0.2;
  if (isNaN(secondsForCurrentLine) || secondsForCurrentLine <= 0) return;
  const currentLineEl = $(`line-${currentIndex}`);
  if (currentLineEl) {
    const activeLanguages = languageOrder.filter(lang => selectedLanguages.includes(lang));
    activeLanguages.forEach(lang => {
        const lineText = usingCustomLyrics && lang === 'Custom'
            ? (lines[currentIndex] || '')
            : (allHymnsData[lang]?.[currentHymnNumber]?.lines[currentIndex] || '');
        const isSignLanguage = lang.includes('SL') || (lang === 'Custom' && lineText.includes('|'));
        if (isSignLanguage) {
            const lyricLineEl = currentLineEl.querySelector(`.lyric-line-${lang}`);
            const beatElements = lyricLineEl ? lyricLineEl.querySelectorAll('.beat-segment') : [];
            if (beatElements.length > 0) {
                const timePerBeat = secondsForCurrentLine / beatElements.length;
                const animationDuration = timePerBeat;
                beatElements.forEach((beatEl, i) => {
                    setTimeout(() => {
                        if (!isPlaying) return;
                        beatEl.style.setProperty('--beat-duration', `${animationDuration}s`);
                        beatEl.classList.add('is-glowing');
                        setTimeout(() => {
                            beatEl.classList.remove('is-glowing');
                            beatEl.style.removeProperty('--beat-duration');
                        }, animationDuration * 1000);
                    }, i * timePerBeat * 1000);
                });
            }
        }
    });
  }
  mainTimer = setTimeout(() => {
    if (!isPlaying) return;
    if (currentIndex < currentLineArray.length - 1) {
      setCurrentIndex(currentIndex + 1);
      startAutoScroll(lineTimings);
    } else {
      isPlaying = false;
      clearTimer();
    }
  }, secondsForCurrentLine * 1000);
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

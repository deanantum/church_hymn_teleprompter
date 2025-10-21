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
    settings.languageOrder = languageOrder.filter(lang => lang !== 'Custom');
    settings.selectedLanguages = selectedLanguages.filter(lang => lang !== 'Custom');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
        try {
            return JSON.parse(savedSettings);
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
    languageOrder.forEach(lang => {
        const langSettings = settings.languages?.[lang] || DEFAULTS.languages[lang];
        if (langSettings) {
            const fontColorActiveInput = $(`fontColor-active-${lang}`);
            const fontColorInactiveInput = $(`fontColor-inactive-${lang}`);
            const fontSizeInput = $(`fontSize-${lang}`);
            if (fontColorActiveInput) fontColorActiveInput.value = langSettings.fontColorActive;
            if (fontColorInactiveInput) fontColorInactiveInput.value = langSettings.fontColorInactive;
            if (fontSizeInput) fontSizeInput.value = langSettings.fontSize;
        }
    });
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

function updateAudioLanguageDisplay() {
  if (!currentHymnNumber) {
    $('audioLanguage').textContent = '';
    return;
  }
  let topLanguage = languageOrder[0] || 'English';
  if (topLanguage === 'Custom' && languageOrder.length > 1) {
    topLanguage = languageOrder[1];
  }
  topLanguage = topLanguage === 'ASL' ? 'English' : topLanguage;
  $('audioLanguage').textContent = `${topLanguage} Music`;
  if (isPlaying && audio) {
    const wasPaused = audio.paused;
    const currentTime = audio.currentTime;
    const trackType = $('trackType').checked ? 'voice' : 'accompaniment';
    const headerInfo = getHymnFileNameFromHeader(true);
    if (!headerInfo) return;
    const hymnNumber = headerInfo.number;
    const newAudioPath = `/hymns/audio/${topLanguage}/${trackType}/${hymnNumber}.mp3`;
    if (audio.src !== newAudioPath) {
      audio.pause();
      audio.src = newAudioPath;
      audio.currentTime = currentTime;
      audio.onloadedmetadata = async () => {
        if (!wasPaused) {
          try {
            await audio.play();
          } catch (err) {
            handlePlayError(err);
          }
        }
      };
      audio.onerror = () => {
        console.error(`Audio file not found: ${newAudioPath}. Falling back to English.`);
        $('audioLanguage').textContent = `English Music`;
        showNotice(`Warning: Audio for ${topLanguage} not found. Playing English audio instead.`);
        const englishFallbackPath = `/hymns/audio/English/${trackType}/${hymnNumber}.mp3`;
        audio.src = englishFallbackPath;
        audio.currentTime = currentTime;
        audio.onloadedmetadata = async () => {
          if (!wasPaused) {
            try {
              await audio.play();
            } catch (err) {
              handlePlayError(err);
            }
          }
        };
        audio.onerror = () => {
          console.error(`English audio file not found: ${englishFallbackPath}`);
          showNotice(`Warning: English audio fallback failed. Playback stopped.`);
          stopHymn();
        };
      };
    }
  }
}

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
      const hasLyrics = Object.values(allHymnsData[lang]).some(hymn => hymn?.lines?.length > 0);

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
    let lineCount;
    if (lang === 'Custom' && usingCustomLyrics) {
      const liveCounter = $('live-line-counter');
      const customCountElement = liveCounter?.querySelector('.count-item strong');
      lineCount = customCountElement ? parseInt(customCountElement.textContent) || 0 : 0;
    } else {
      lineCount = allHymnsData[lang]?.[currentHymnNumber]?.lines?.length || 0;
    }
    // Create elements programmatically to avoid whitespace
    const li = document.createElement('li');
    li.className = 'language-item';
    li.draggable = true;
    li.dataset.lang = lang;

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
    label.textContent = `${lang} (Line Count: ${lineCount})`;

    div.appendChild(input);
    div.appendChild(label);
    li.appendChild(div);
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
    $('trackType').disabled = !hasAudio || isPlaying; // Also disable if playing
    $('introLength').disabled = !hasAudio || isPlaying;
    enablePlaybackControls(isPlaying, audio && audio.paused && !isPlaying, !hasAudio); // Update controls based on state
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
    updateLiveCounter(); // Update custom line count
    // No need to set usingCustomLyrics = true here, that happens when loading custom lyrics
    enablePlaybackControls(false, false, true); // Disable playback controls in custom view
  }
}

function loadCustomLyrics() {
  currentIndex = 0;
  const customText = $('customLyricsTextarea').value;
  const customLines = customText.split('\n').filter(line => line.trim() !== '');
  if (customLines.length === 0) return;
  lines = customLines;
  usingCustomLyrics = true;
  const liveCounter = $('live-line-counter');
  const mismatchElement = liveCounter?.querySelector('.count-mismatch');
  if (mismatchElement) {
    mismatchElement.textContent = customLines.length;
  }
  if (!availableLanguages.includes('Custom')) {
    availableLanguages.push('Custom');
    languageOrder.push('Custom');
  }
  if (!selectedLanguages.includes('Custom')) {
     if(selectedLanguages.length < 3) {
        selectedLanguages.push('Custom');
     } else {
        showNotice("Max 3 languages selected. Custom lyrics loaded but not displayed.");
     }
  }
  updateLiveCounter();
  renderLanguageList();
  updateLanguageSettings();
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
        lines = lyricsLines;
        usingCustomLyrics = true;
        if (!availableLanguages.includes('Custom')) {
          availableLanguages.push('Custom');
          languageOrder.push('Custom');
          if (selectedLanguages.length < 3 && !selectedLanguages.includes('Custom')) {
            selectedLanguages.push('Custom');
          } else if (selectedLanguages.length >= 3) {
            showNotice("Maximum 3 languages can be selected. Custom lyrics loaded but not displayed.");
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
    const getLineCount = (lang) => {
        if (lang === 'Custom' && usingCustomLyrics) return lines.length;
        if (!currentHymnNumber) return 0;
        return allHymnsData[lang]?.[currentHymnNumber]?.lines?.length || 0;
    };
    const maxLines = usingCustomLyrics
        ? lines.length
        : Math.max(...selectedLanguages.map(getLineCount).concat(0));
    for (let index = 0; index < maxLines; index++) {
        const div = document.createElement('div');
        div.className = 'lyric-line-group';
        div.id = `line-${index}`;
        languageOrder.forEach(lang => {
            if (!selectedLanguages.includes(lang)) return;
            let lineText = '';
            if (lang === 'Custom' && usingCustomLyrics) {
                lineText = (lines[index] || '').replace(/-/g, '\u2011');
            } else if (!usingCustomLyrics && allHymnsData[lang]?.[currentHymnNumber]?.lines) {
                lineText = (allHymnsData[lang][currentHymnNumber].lines[index] || '').replace(/-/g, '\u2011');
            } else if (usingCustomLyrics && lang !== 'Custom' && allHymnsData[lang]?.[currentHymnNumber]?.lines) {
                 lineText = (allHymnsData[lang][currentHymnNumber].lines[index] || '').replace(/-/g, '\u2011');
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

function initializeAudio(hymnNumber, wasPlaying = false, currentTime = 0, onManualSetup = null) {
  if (!hymnNumber) {
      console.warn("initializeAudio called with no hymn number.");
      return; // Don't proceed without a hymn number
  }

  const trackType = $('trackType').checked ? 'voice' : 'accompaniment';
  let topLanguage = languageOrder.length > 0 ? languageOrder[0] : 'English'; // Ensure fallback language
  if (topLanguage === 'Custom' && languageOrder.length > 1) {
    topLanguage = languageOrder[1];
  }
  topLanguage = topLanguage === 'ASL' ? 'English' : topLanguage; // ASL uses English audio

  // Safely update audio language display
  const audioLangElement = $('audioLanguage');
  if (audioLangElement) audioLangElement.textContent = `${topLanguage} Music`;

  const headerInfo = getHymnFileNameFromHeader(true);
  if (!headerInfo) {
      console.error("Could not get hymn file name from header for audio.");
      return;
  }
  const hymnNum = headerInfo.number;
  const fullAudioPath = `audio/${topLanguage}/${trackType}/${hymnNum}.mp3`; // Removed leading slash

  if (audio) {
      audio.pause(); // Pause existing audio if any
      audio = null; // Discard old audio object to prevent state issues
  }
  console.log(`Initializing audio: ${fullAudioPath}`);
  audio = new Audio(fullAudioPath);
  audio.currentTime = currentTime;
  audio.addEventListener('timeupdate', updateCounter);
  audio.addEventListener('ended', onAudioEnded);

  audio.onloadedmetadata = async () => {
    console.log(`Audio metadata loaded for ${fullAudioPath}`);
    
    const manualCheckbox = $('manualControlOverride');
		if (manualCheckbox && manualCheckbox.checked) {
				// If audio loaded successfully, uncheck the box
				// (User can re-check if they still want manual override)
				console.log("Audio loaded (fallback), unchecking manual override.");
				manualCheckbox.checked = false;
				toggleManualControl(); // Update UI state to non-manual
		}
    
    if (wasPlaying) {
      try {
        await audio.play();
        console.log("Resuming audio play.");
      } catch (err) {
        handlePlayError(err);
      }
    }
    // Only enable controls fully if metadata loads
    enablePlaybackControls(wasPlaying, !wasPlaying && currentTime > 0);
  };

  // --- Primary Audio Error Handler ---
  audio.onerror = () => {
    console.error(`Audio file not found (or error): ${fullAudioPath}. Falling back to English.`);
    if (audioLangElement) audioLangElement.textContent = `English Music`; // Update display
    showNotice(`Warning: Audio for ${topLanguage} not found. Trying English audio instead.`);

    const englishFallbackPath = `audio/English/${trackType}/${hymnNum}.mp3`; // Removed leading slash

    // Discard failed audio object, create new one for fallback
    audio = new Audio(englishFallbackPath);
    audio.currentTime = currentTime;
    audio.addEventListener('timeupdate', updateCounter); // Re-add listeners
    audio.addEventListener('ended', onAudioEnded);

    audio.onloadedmetadata = async () => { // English fallback loaded successfully
      console.log(`Audio metadata loaded for English fallback: ${englishFallbackPath}`);
      
      const manualCheckbox = $('manualControlOverride');
			if (manualCheckbox && manualCheckbox.checked) {
					// If audio loaded successfully, uncheck the box
					// (User can re-check if they still want manual override)
					console.log("Audio loaded, unchecking manual override.");
					manualCheckbox.checked = false;
					toggleManualControl(); // Update UI state to non-manual
			}
      
      if (wasPlaying) {
        try {
          await audio.play();
          console.log("Resuming audio play (English fallback).");
        } catch (err) {
          handlePlayError(err);
        }
      }
      enablePlaybackControls(wasPlaying, !wasPlaying && currentTime > 0);
    };

    // --- English Fallback Error Handler ---
    audio.onerror = () => {
      console.error(`English audio fallback also failed: ${englishFallbackPath}`);
      audio = null; // No working audio object

      // Check if lyrics exist for this hymn number in ANY loaded language data
      const lyricsExist = Object.values(allHymnsData).some(langData =>
        currentHymnNumber && langData[currentHymnNumber]?.lines?.length > 0
      );

      if (lyricsExist) {
        console.log("Audio failed, but lyrics exist. Enabling Manual Control.");
        // Use showNotice instead of alert for less disruption
        showNotice("Audio file not found. Manual Control Override has been enabled.");

        const manualCheckbox = $('manualControlOverride');
        if (manualCheckbox) {
            manualCheckbox.checked = true; // Check the box
            toggleManualControl(); // Apply manual mode UI changes (focus, etc.)
        }
        enablePlaybackControls(false, false, true); // Disable ALL audio buttons (Play, Pause, Stop)
        setCurrentIndex(0, true); // Ensure lyrics display starts at the beginning

        // Execute the callback passed from playHymn (if any) to signal manual setup
        if (onManualSetup) {
            onManualSetup();
        }

      } else {
        // No audio AND no lyrics found
        console.error(`No audio or lyrics found for Hymn ${hymnNumber}. Cannot proceed.`);
        showNotice(`Error: Audio files not found and no lyrics available for Hymn ${hymnNumber}. Playback stopped.`);
        stopHymn(); // Stop everything if nothing can be displayed or played
      }
    }; // End English fallback onerror
  }; // End primary audio onerror
}

function playHymn() {

	if (!currentHymnNumber && !usingCustomLyrics) {
      showNotice("No hymn selected and no custom lyrics loaded.");
      return;
  }
  const currentLyrics = usingCustomLyrics ? lines : initialHymnLines;
  if (!currentLyrics || currentLyrics.length === 0) {
      showNotice("No lyrics available to display for the current selection.");
      return; // Can't play/display if no lyrics exist
  }
  
  stopHymn();
	console.log("playHymn: Called. State reset.");
	
	// Handle custom lyrics without an associated hymn number (always manual)
  if (usingCustomLyrics && !currentHymnNumber) {
    console.log("playHymn: Handling custom lyrics without audio.");
    showNotice("Playing custom lyrics without audio. Use Manual Control.");
    isPlaying = true; // Set playing state for manual mode
    const manualCheckbox = $('manualControlOverride');
    if (manualCheckbox && !manualCheckbox.checked) {
        manualCheckbox.checked = true;
    }
    toggleManualControl(); // Apply manual mode UI (focus etc.)
    enablePlaybackControls(true, false); // Enable Pause/Stop
    setCurrentIndex(0, true); // Start lyrics at the beginning
    return; // Exit function for custom-only lyrics
  }
  
  // --- Attempt to initialize audio for standard hymns ---
  console.log(`playHymn: Attempting to initialize audio for Hymn ${currentHymnNumber}...`);
  setCurrentIndex(0, true); // Set lyrics to start immediately while audio loads/fails
  enablePlaybackControls(false, false, false); // Keep controls disabled initially until audio status known
  $('trackType').disabled = true; // Disable track type switch during attempt
  document.querySelectorAll('input, textarea, button').forEach(el => el.blur()); // Blur inputs
	
  const introLength = parseFloat($("introLength").value);
  if ((lines.length === 0 && !initialHymnLines.length)) return;

  if (usingCustomLyrics && !currentHymnNumber) {
    showNotice("Playing without audio. Use Manual Control.");
    isPlaying = true;
    enablePlaybackControls(true);
    $('manualControlOverride').checked = true;
    toggleManualControl();
    setCurrentIndex(0, true);
    return;
  }

  // This callback will run *only* if initializeAudio sets up manual mode successfully
  initializeAudio(currentHymnNumber, false, 0, () => {
      // --- Manual Setup Callback ---
      console.log("playHymn: Manual mode setup completed by initializeAudio's error handler.");
      isPlaying = true; // Set playing state for manual mode
      // Play/Pause/Stop should reflect manual control state
      // enablePlaybackControls(true, false); // Enable Pause/Stop for manual scrolling << Let's keep them disabled as per the onerror
      enablePlaybackControls(false, false, true); // Keep audio controls disabled in manual mode
      // Note: setCurrentIndex(0, true) was already called in the onerror handler
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
    setCurrentIndex(0, true);
    lyricsViewport.classList.add('intro-active');
    isPlaying = true;
    $('trackType').disabled = true;
    document.querySelectorAll('input, textarea, button').forEach(el => el.blur());
    if ($('manualControlOverride').checked) {
      lyricsViewport.focus();
    }
    try {
      await audio.play();
    } catch (err) {
      handlePlayError(err);
    }
    enablePlaybackControls(true);
    await startIntroCountdown(introLength);
    lyricsViewport.classList.remove('intro-active');

		if (!$('manualControlOverride').checked) {
				startAutoScroll(lineTimings);
		} else {
				// Listener is already handled by toggleManualControl, ensure focus:
				lyricsViewport.focus();
		}

  };
}

function stopHymn() {
  isPlaying = false;
	showNotice('');
  if (audio) { audio.pause(); audio.currentTime = 0; audio = null; }
  clearTimer();
  document.querySelectorAll('.beat-segment.is-glowing').forEach(el => {
    el.classList.remove('is-glowing');
  });
  $('metaCounter').textContent = "- / -";
  if (!currentHymnNumber) $('audioLanguage').textContent = '';
  $('countdown-display').classList.remove('is-visible');
  lyricsViewport.classList.remove('is-counting-down', 'intro-active');
  enablePlaybackControls(false);
  $('trackType').disabled = false;
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
  $('trackType').disabled = false;
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
  const params = new URLSearchParams(location.search);
  runlistNumbers = params.get("runlist") ? params.get("runlist").split(',').map(s => s.trim()) : [];

  console.log("InitializePage: Starting."); // Log start

  // Try initializing palette early, check if it causes issues
  try {
      initializeColorPalette();
      console.log("InitializePage: Color palette initialized.");
  } catch(paletteError) {
      console.error("InitializePage: Error initializing color palette:", paletteError);
      showNotice("Error setting up color palette.");
      // Allow execution to continue if possible, or decide to stop
  }


  // Set the default view BEFORE trying to load data
  try {
      setView('hymn');
      console.log("InitializePage: Default view set to 'hymn'.");
  } catch (setViewError) {
      console.error("InitializePage: Error setting initial view:", setViewError);
      // This is critical, maybe alert user or stop?
      alert("Critical error setting up initial view. Page may not function correctly.");
      return; // Stop initialization if view setting fails
  }


  loadAvailableLanguages().then(() => {
    // --- Start of .then() block ---
    console.log("InitializePage .then(): Language data loaded, processing...");

    let savedSettings;
    try {
        savedSettings = loadSettings();
        console.log("InitializePage .then(): Settings loaded.");
    } catch (loadSettingsError) {
        console.error("InitializePage .then(): Error loading settings:", loadSettingsError);
        savedSettings = null; // Continue with defaults if loading fails
    }

    // Process language order and selection
    try {
        if (savedSettings?.languageOrder) {
          languageOrder = savedSettings.languageOrder.filter(lang => availableLanguages.includes(lang));
          availableLanguages.forEach(lang => {
            if (!languageOrder.includes(lang)) languageOrder.push(lang);
          });
        } else {
           languageOrder = [...availableLanguages];
        }

        if (savedSettings?.selectedLanguages) {
          selectedLanguages = savedSettings.selectedLanguages.filter(lang => availableLanguages.includes(lang));
           if (selectedLanguages.length === 0 && availableLanguages.length > 0) {
             selectedLanguages = [availableLanguages[0]];
           }
        } else if (availableLanguages.length > 0) {
           selectedLanguages = [availableLanguages[0]];
        }
        console.log("InitializePage .then(): Language order and selection processed.");
        console.log("Selected Languages:", selectedLanguages);
        console.log("Language Order:", languageOrder);
    } catch (langSetupError) {
        console.error("InitializePage .then(): Error setting up language order/selection:", langSetupError);
        // Attempt fallback
        languageOrder = availableLanguages.length > 0 ? [...availableLanguages] : ['English'];
        selectedLanguages = availableLanguages.length > 0 ? [availableLanguages[0]] : ['English'];
        showNotice("Error applying saved language settings, using defaults.");
    }


    const runlistPanel = $('runlist-panel');
    let hymnDataLoaded = false;

    // Process Runlist or Single Hymn
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
             if (!runlistDisplay) throw new Error("Runlist display element not found!"); // Add check
            runlistDisplay.innerHTML = '';
            runlistNumbers.forEach((num, idx) => {
              const entry = allHymnsData['English']?.[num] || {};
              const title = entry.title || 'Unknown';
              const li = document.createElement('li');
              li.textContent = `${num} - ${title}`;
              li.dataset.index = idx;
              li.addEventListener('click', () => {
                 // --- Runlist Click Handler ---
                 try { // Wrap click handler in try/catch
                    stopHymn();
                    currentRunlistIndex = idx;
                    currentHymnNumber = num;
                    const clickedEntry = allHymnsData['English']?.[num] || {};
                    $('pageHeader').textContent = `Hymn ${num} - ${clickedEntry.title || 'Unknown'}`;
                    initialHymnLines = clickedEntry.lines || [];
                    lines = [...initialHymnLines];
                    usingCustomLyrics = false;
                    $('introLength').value = clickedEntry?.intro_length !== undefined ? parseFloat(clickedEntry.intro_length).toFixed(1) : 5;
                    populateLyricsContainer();
                    updateLineCountDisplay();
                    updateAudioLanguageDisplay();
                    runlistDisplay.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                    li.classList.add('active');
                    initializeAudio(num);
                 } catch (clickError) {
                    console.error("Error in runlist click handler:", clickError);
                    showNotice("An error occurred switching hymns in the runlist.");
                 }
                 // --- End Runlist Click Handler ---
              });
              runlistDisplay.appendChild(li);
            });

            runlistDisplay.querySelector('li')?.classList.add('active'); // Safe navigation
            $('pageHeader').textContent = `Hymn ${currentHymnNumber} - ${firstEntry.title || 'Unknown'}`;
            initialHymnLines = firstEntry.lines || [];
            lines = [...initialHymnLines];
            usingCustomLyrics = false;
            $('introLength').value = firstEntry?.intro_length !== undefined ? parseFloat(firstEntry.intro_length).toFixed(1) : 5;
            initializeAudio(currentHymnNumber);
            console.log("InitializePage .then(): Runlist processed successfully.");
          } else {
            console.error(`Could not find data for first hymn in runlist: ${currentHymnNumber}`);
            if (runlistPanel) runlistPanel.style.display = 'none';
          }
        } else {
          // Handle single hymn
          console.log("InitializePage .then(): Processing single hymn...");
          if (runlistPanel) runlistPanel.style.display = 'none';
          currentHymnNumber = params.get("n");
          if (currentHymnNumber && allHymnsData['English']?.[currentHymnNumber]) {
            hymnDataLoaded = true;
            usingCustomLyrics = false;
            const entry = allHymnsData['English'][currentHymnNumber];
            initialHymnLines = entry?.lines || [];
            lines = [...initialHymnLines];
            $('pageHeader').textContent = `Hymn ${currentHymnNumber} - ${entry?.title || 'Unknown'}`;
            $('introLength').value = entry?.intro_length !== undefined ? parseFloat(entry.intro_length).toFixed(1) : 5;
            initializeAudio(currentHymnNumber);
            console.log("InitializePage .then(): Single hymn processed successfully.");
          } else {
            currentHymnNumber = null;
            lines = [];
            initialHymnLines = [];
            $('pageHeader').textContent = "No Hymn Selected";
            $('introLength').value = 5;
            console.log("InitializePage .then(): No valid single hymn number found.");
          }
        }
    } catch (hymnLoadError) {
        console.error("InitializePage .then(): Error processing hymn data:", hymnLoadError);
        showNotice("Error loading hymn details. Display might be incomplete.");
        // Attempt to recover or set error state
        currentHymnNumber = null;
        lines = [];
        initialHymnLines = [];
        if (runlistPanel) runlistPanel.style.display = 'none';
        $('pageHeader').textContent = "Error Loading Hymn";
        enablePlaybackControls(false, false, true); // Disable playback if hymn failed
    }


    // Populate lyrics container
    try {
        populateLyricsContainer();
        console.log("InitializePage .then(): Lyrics container populated.");
        updateLineCountDisplay();
        console.log("InitializePage .then(): Line count updated.");
    } catch(populateError) {
        console.error("InitializePage .then(): Error populating lyrics:", populateError);
        showNotice("Error displaying lyrics.");
    }

    // Apply Settings
    try {
        renderLanguageList();
        console.log("InitializePage .then(): Language list rendered.");
        updateLanguageSettings(); // Call the element-building version
        console.log("InitializePage .then(): Language settings UI updated.");
        const settingsToApply = { ...DEFAULTS, ...(savedSettings || {}) };
        updateFormFromSettings(settingsToApply);
        console.log("InitializePage .then(): Settings form updated.");
        applySettings(settingsToApply);
        console.log("InitializePage .then(): Settings applied visually.");
    } catch (settingsError) {
        console.error("InitializePage .then(): Error applying settings UI:", settingsError);
        showNotice("Error applying user settings.");
        // If this block fails, the original error might be here
        // ** The error probably happens in renderLanguageList or updateLanguageSettings **
    }


    // Setup Event Listeners
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
            localStorage.removeItem(SETTINGS_KEY);
            languageOrder = [...availableLanguages];
            selectedLanguages = availableLanguages.length > 0 ? [availableLanguages[0]] : [];
            renderLanguageList();
            updateLanguageSettings();
            updateFormFromSettings(DEFAULTS);
            applySettings(DEFAULTS);
            populateLyricsContainer();
          }
        });

        // Custom Lyrics Buttons
        $('loadCustomLyricsBtn')?.addEventListener('click', loadCustomLyrics);
        $('loadExcelBtn')?.addEventListener('click', loadExcelLyrics);
        $('customLyricsTextarea')?.addEventListener('input', updateLiveCounter);
        $('exitCustomBtn')?.addEventListener('click', () => setView('hymn'));

        // Collapsible Section Toggles & Manual Control
        $('settings-toggle')?.addEventListener('click', () => toggleCollapsibleById('settings'));
        $('lyric-order-toggle')?.addEventListener('click', () => toggleCollapsibleById('lyric-order'));
         $('playback-toggle')?.addEventListener('click', () => toggleCollapsibleById('playback')); // Check if this ID exists in HTML
        $('manualControlOverride')?.addEventListener('change', toggleManualControl);
        console.log("InitializePage .then(): Event listeners set up.");
    } catch(listenerError) {
        console.error("InitializePage .then(): Error setting up event listeners:", listenerError);
        showNotice("Warning: Some controls might not work correctly.");
    }

    // Final state checks
    try {
        updateAudioLanguageDisplay();
        if (!hymnDataLoaded && !usingCustomLyrics) {
           showNotice("No hymn selected or data found. Please select a hymn or load custom lyrics.");
        }
        console.log("InitializePage .then(): Final checks complete.");
    } catch (finalCheckError){
        console.error("InitializePage .then(): Error during final checks:", finalCheckError);
    }

    console.log("InitializePage .then(): Initialization sequence finished.");
    // --- End of .then() block ---

  }).catch(err => {
    // --- SIMPLIFIED CATCH BLOCK ---
    // This block should ideally only run if loadAvailableLanguages() *itself* fails (e.g., network error on ALL files)
    // Or if an error occurs *within* the .then() block that wasn't caught by inner try/catch blocks
    console.error("InitializePage --- CATCH BLOCK REACHED --- Error:", err); // Log the detailed error

    try {
        showNotice(`CRITICAL ERROR during initialization: ${err.message}. Check Console (F12).`);
    } catch (e) {
        console.error("Failed even to show notice:", e);
    }

    try { $('pageHeader').textContent = "Initialization Error"; } catch(e) { /* ignore */ }
    try { $('introLength').value = 5; } catch(e) { /* ignore */ }
    lines = [];
    initialHymnLines = [];

    try {
        enablePlaybackControls(false, false, true);
    } catch (e) {
        console.error("Failed to disable playback controls in catch block:", e);
    }
  }); // End of .catch
} // End of initializePage
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
}

function enablePlaybackControls(isPlaying, isPaused = false, forceDisableAll = false) {
  $('btnPlay').disabled = forceDisableAll || isPlaying || isPaused;
  $('btnPauseResume').disabled = forceDisableAll || (!isPlaying && !isPaused);
  $('btnPauseResume').innerHTML = isPlaying ? '&#9208; Pause' : '&#9199; Resume';
  $('btnStop').disabled = forceDisableAll || (!isPlaying && !isPaused);
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

document.addEventListener('DOMContentLoaded', initializePage);

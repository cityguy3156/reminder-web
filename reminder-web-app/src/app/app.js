import { StimulusCanvas } from "./stimulus.js";
import { Hud } from "./hud.js";
import { MicRmsGate } from "./mic.js";
import { VisionEyeGate } from "./vision.js";
import { ClosedEdgeTrigger } from "./debounce.js";
import { UiState } from "./ui.js";

export class App {
  constructor() {
    // =========================
    // ROOT
    // =========================
    this.root = document.createElement("div");
    this.root.id = "appRoot";
    this.root.style.position = "fixed";
    this.root.style.inset = "0";
    this.root.style.background = "#0b1220";
    this.root.style.overflow = "hidden";

    // ---------- Brand banner ----------
    this.banner = document.createElement("div");
    this.banner.id = "brandBanner";
    Object.assign(this.banner.style, {
      position: "absolute",
      top: "14px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      pointerEvents: "none",
    });

    this.bannerImg = document.createElement("img");
    this.bannerImg.src = "/Mask.png"; // put brand.png in /public
    this.bannerImg.alt = "The-Reminder";
    Object.assign(this.bannerImg.style, {
      height: "200px",
      maxWidth: "80vw",
      zIndex: "0",
      objectFit: "contain",
    });

    this.bannerText = document.createElement("div");
    this.bannerText.textContent = "WELCOME TO THE REMINDER";
    Object.assign(this.bannerText.style, {
      fontFamily: "'TheReminder', system-ui, sans-serif",
      fontSize: "60px",
      fontWeight: "900",
      color: "#fff",
      objectFit: "contain",
      textShadow: "0 10px 28px rgba(0,0,0,0.65)",
    });

    this.banner.appendChild(this.bannerImg);
    this.banner.appendChild(this.bannerText);

    // =========================
    // CORE STATE
    // =========================
    this.running = false;
    this._frames = 0;

    this.stimulus = new StimulusCanvas();
    this.hud = new Hud();
    this.ui = new UiState();
    this.mic = new MicRmsGate();
    this.vision = new VisionEyeGate();
    this.eyeTrigger = new ClosedEdgeTrigger({ closeDelayS: 0.12, openDelayS: 0.12 });

    this.requireEyesOpen = false;
    this.requireSilence = true;

    this.eyeGraceMs = 1500;
    this._eyeGraceUntil = 0;

    this.triggersOn = false;
    this._visionError = "";

    // =========================
    // SPEECH STATE
    // =========================
    // speechMode: "none" | "silent" | "repeat" (mutually exclusive, but can be none)
    this.speechMode = "none";
    this.speechPhrases = [];
    this._repeatStopToken = 0;
    this._activeSpeechRec = null;
    this._ttsUtter = null;
    this._speechHudLine = "";
    this._repeatPickIndex = -1;
    this.silentStrictness = 35; // 0-100, higher = more sensitive
    this.speechVoiceURI = "";  // selected voice
    this._micBaseThreshold = this.mic.threshold;
    this._silentWasFail = false;
    this._silentLastBuzzMs = 0;


    // =========================
    // SOUND STATE
    // =========================
    this._loopAudios = [];
    this.soundMode = "overload"; // "sequential" | "overload"
    this._seqIndex = 0;

    // (PATCH v6) token to prevent overlapping sequential callbacks
    this._seqToken = 0;

    // Prime sound
    this._primeAudio = null;

    // Loudness goal:
    // - normalize EACH normal track to target RMS
    // - in overload, scale normals by 1/N so combined "normal bed" stays near target RMS
    // - prime is normalized too, then multiplied by primeRatio (50% louder)
    this._targetRms = 0.10;
    this._primeRatio = 2.00;

    // ---- WebAudio pipeline ----
    this.audioCtx = null;
    this.masterGain = null;
    this.compressor = null;

    // WebAudio registry
    // normals: { audioEl, src, gain, rms, url }
    this._waTracks = [];
    // prime: { audioEl, src, gain, rms, url } | null
    this._waPrime = null;
    // Prime recording state (MediaRecorder)
    this._recStream = null;
    this._recorder = null;
    this._recChunks = [];
    this._isRecordingPrime = false;

    // Live RMS capture during recording (fallback if decodeAudioData cannot decode blob format)
    this._recRmsSumSq = 0;
    this._recRmsN = 0;
    this._recSrcNode = null;
    this._recRmsNode = null;
    this._recZeroGain = null;
    this._lastRecordedPrimeRms = 0;

    // Prime preview playbar
    this.primePlayback = null;
    // WebAudio preview routing (lets us hear very quiet recordings)
    this._primePreviewSrc = null;
    this._primePreviewGain = null;
    this._primePreviewUrl = "";

    // Fullscreen recording overlay
    this.recordOverlay = null;
    this._recTimerEl = null;
    this._recStartTime = 0;
    this._recTimerInterval = null;


    // =========================
    // CONTROLS (top right)
    // =========================
    this.controls = document.createElement("div");
    this.controls.style.position = "absolute";

    // Bottom-center
    this.controls.style.left = "50%";
    this.controls.style.bottom = "22px";
    this.controls.style.transform = "translateX(-50%)";

    // Match your tile grid width: (3 * 220px) + (2 * 26px) = 712px
    // Keep it responsive so it doesn't overflow on smaller screens
    this.controls.style.width = "min(712px, calc(100vw - 40px))";

    this.controls.style.display = "flex";
    this.controls.style.justifyContent = "center";
    this.controls.style.zIndex = "3";

    this.btnStart = document.createElement("button");
    this.btnStart.textContent = "Start";

    this.btnStart.style.width = "100%";
    this.btnStart.style.height = "86px";
    this.btnStart.style.fontSize = "28px";
    this.btnStart.style.fontWeight = "900";
    this.btnStart.style.borderRadius = "14px";
    this.btnStart.style.border = "1px solid rgba(255,255,255,0.18)";
    this.btnStart.style.background = "#b00000";
    this.btnStart.style.color = "white";
    this.btnStart.style.boxShadow = "0 14px 40px rgba(0,0,0,0.55)";

    this.btnStop = document.createElement("button");
    this.btnStop.textContent = "Stop";
    this.btnStop.disabled = true;

    this.controls.appendChild(this.btnStart);
    // this.controls.appendChild(this.btnStop);

    // =========================
    // HOME PANEL
    // =========================
    this.homePanel = document.createElement("div");
    this.homePanel.style.position = "absolute";
    this.homePanel.style.left = "0";
    this.homePanel.style.top = "0";
    this.homePanel.style.right = "0";
    this.homePanel.style.bottom = "0";
    this.homePanel.style.display = "grid";
    this.homePanel.style.gridTemplateColumns = "repeat(3, 220px)";
    this.homePanel.style.gap = "26px";
    this.homePanel.style.placeContent = "center";
    this.homePanel.style.zIndex = "2";

    const mkTile = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.width = "210px";
      b.style.height = "210px";
      b.style.fontSize = "22px";
      b.style.fontWeight = "900";
      b.style.borderRadius = "18px";
      b.style.border = "1px solid rgba(255,255,255,0.08)";
      b.style.background = "rgba(46,160,67,0.35)";
      b.style.color = "white";
      b.style.cursor = "pointer";
      return b;
    };

    this.btnHomeSights = mkTile("Sights");
    this.btnHomeSounds = mkTile("Sounds");
    this.btnHomeSpeech = mkTile("Speech");

    this.homePanel.appendChild(this.btnHomeSights);
    this.homePanel.appendChild(this.btnHomeSounds);
    this.homePanel.appendChild(this.btnHomeSpeech);

    // =========================
    // FILE INPUTS
    // =========================
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.multiple = true;
    this.fileInput.accept = "image/*";
    this.fileInput.style.position = "fixed";
    this.fileInput.style.left = "-9999px";

    this.soundsInput = document.createElement("input");
    this.soundsInput.type = "file";
    this.soundsInput.multiple = true;
    this.soundsInput.accept = "audio/*";
    this.soundsInput.style.position = "fixed";
    this.soundsInput.style.left = "-9999px";

    // Folder pickers (Chromium: webkitdirectory). We expose 2 choices in UI:
    // - Folder (top-level only): ignore files in subfolders
    // - Folder (include subfolders): take all files
    this.imagesFolderInput = document.createElement("input");
    this.imagesFolderInput.type = "file";
    this.imagesFolderInput.multiple = true;
    this.imagesFolderInput.webkitdirectory = true;
    this.imagesFolderInput.style.position = "fixed";
    this.imagesFolderInput.style.left = "-9999px";

    this.soundsFolderInput = document.createElement("input");
    this.soundsFolderInput.type = "file";
    this.soundsFolderInput.multiple = true;
    this.soundsFolderInput.webkitdirectory = true;
    this.soundsFolderInput.style.position = "fixed";
    this.soundsFolderInput.style.left = "-9999px";

    this.primeInput = document.createElement("input");
    this.primeInput.type = "file";
    this.primeInput.multiple = false;
    this.primeInput.accept = "audio/*";
    this.primeInput.style.position = "fixed";
    this.primeInput.style.left = "-9999px";

    // =========================
    // SIGHTS PANEL
    // =========================
    this.sightsPanel = document.createElement("div");
    this.sightsPanel.id = "sightsPanel";
    this.sightsPanel.style.position = "absolute";
    this.sightsPanel.style.left = "50%";
    this.sightsPanel.style.top = "50%";
    this.sightsPanel.style.transform = "translate(-50%, -50%)";
    this.sightsPanel.style.width = "min(980px, calc(100vw - 60px))";
    this.sightsPanel.style.height = "min(760px, calc(100vh - 60px))";
    this.sightsPanel.style.background = "#2a3443";
    this.sightsPanel.style.border = "1px solid rgba(255,255,255,0.10)";
    this.sightsPanel.style.borderRadius = "18px";
    this.sightsPanel.style.boxShadow = "0 22px 70px rgba(0,0,0,0.55)";
    this.sightsPanel.style.padding = "18px";
    this.sightsPanel.style.display = "none";
    this.sightsPanel.style.flexDirection = "column";
    this.sightsPanel.style.gap = "18px";
    this.sightsPanel.style.zIndex = "2";

    // Header
    this.sightsHeader = document.createElement("div");
    this.sightsHeader.className = "sightsHeader";

    this.sightsTitle = document.createElement("div");
    this.sightsTitle.className = "sightsTitle";
    this.sightsTitle.textContent = "Sights";

    this.sightsClose = document.createElement("button");
    this.sightsClose.className = "sightsClose";
    this.sightsClose.textContent = "✕";
    this.sightsClose.onclick = () => this._showPage("home");

    this.sightsHeader.appendChild(this.sightsTitle);
    this.sightsHeader.appendChild(this.sightsClose);

    // Upload buttons
    this.btnUploadImages = document.createElement("button");
    this.btnUploadImages.classList.add("uploadHero");
    this.btnUploadImages.innerHTML = `🖼️ <span>Upload Images</span>`;


    this.imagesCountHint = document.createElement("div");
    this.imagesCountHint.className = "countHint";
    // this.imagesCountHint.textContent = "Images: 0";
    this.btnClearImages = document.createElement("button");
    this.btnClearImages.textContent = "Clear Images";

    // Tile grid
    this.tileGrid = document.createElement("div");
    this.tileGrid.className = "tileGrid";

    // Eye tracking tile
    this.btnEyeTile = document.createElement("button");
    this.btnEyeTile.className = "tileBtn eyeTile";
    this.btnEyeTile.innerHTML = `<div class="tileIconCircle">👁️</div><div class="tileLabel">Eye<br/>Tracking</div>`;

    // Subliminal triggers tile
    this.btnTrigTile = document.createElement("button");
    this.btnTrigTile.className = "tileBtn trigTile";
    this.btnTrigTile.innerHTML = `<div class="tileIconCircle">⚡</div><div class="tileLabel">Subliminal<br/>Triggers</div>`;

    this.tileGrid.appendChild(this.btnEyeTile);
    this.tileGrid.appendChild(this.btnTrigTile);

    // Words card
    this.wordsCard = document.createElement("div");
    this.wordsCard.className = "wordsCard hidden";

    this.wordInput = document.createElement("input");
    this.wordInput.type = "text";
    this.wordInput.placeholder = "Enter word...";
    this.wordInput.style.width = "260px";

    this.btnAddWord = document.createElement("button");
    this.btnAddWord.textContent = "+";
    this.btnAddWord.className = "wordsAddBtn";

    this.btnClearWords = document.createElement("button");
    this.btnClearWords.textContent = "Clear Words";
    this.btnClearWords.className = "wordsClearBtn";

    this.wordsList = document.createElement("div");
    this.wordsList.className = "wordsList";

    this.wordsInputRow = document.createElement("div");
    this.wordsInputRow.className = "wordsInputRow";
    this.wordsInputRow.appendChild(this.wordInput);
    this.wordsInputRow.appendChild(this.btnAddWord);

    this.wordsFooter = document.createElement("div");
    this.wordsFooter.className = "wordsFooter";
    this.wordsFooter.appendChild(this.btnClearWords);

    this.wordsCard.appendChild(this.wordsInputRow);
    this.wordsCard.appendChild(this.wordsList);
    this.wordsCard.appendChild(this.wordsFooter);

    this.sightsBody = document.createElement("div");
    this.sightsBody.className = "sightsBody";
    this.sightsBody.appendChild(this.tileGrid);
    this.sightsBody.appendChild(this.wordsCard);

    this.sightsPanel.appendChild(this.sightsHeader);
    this.sightsPanel.appendChild(this.btnUploadImages);
    // this.sightsPanel.appendChild(this.imagesCountHint);
    this.sightsPanel.appendChild(this.btnClearImages);
    this.sightsPanel.appendChild(this.sightsBody);

    // =========================
    // SOUNDS PANEL
    // =========================
    this.soundsPanel = document.createElement("div");
    this.soundsPanel.style.position = "absolute";
    this.soundsPanel.style.left = "50%";
    this.soundsPanel.style.top = "50%";
    this.soundsPanel.style.transform = "translate(-50%, -50%)";
    this.soundsPanel.style.width = "min(980px, calc(100vw - 60px))";
    this.soundsPanel.style.height = "min(760px, calc(100vh - 60px))";
    this.soundsPanel.style.background = "#2a3443";
    this.soundsPanel.style.border = "1px solid rgba(255,255,255,0.10)";
    this.soundsPanel.style.borderRadius = "18px";
    this.soundsPanel.style.boxShadow = "0 22px 70px rgba(0,0,0,0.55)";
    this.soundsPanel.style.padding = "18px";
    this.soundsPanel.style.display = "none";
    this.soundsPanel.style.flexDirection = "column";
    this.soundsPanel.style.gap = "18px";
    this.soundsPanel.style.zIndex = "2";

    const header = document.createElement("div");
    header.className = "sightsHeader";

    const title = document.createElement("div");
    title.className = "sightsTitle";
    title.textContent = "Sounds";

    const closeBtn = document.createElement("button");
    closeBtn.className = "sightsClose";
    closeBtn.textContent = "✕";
    closeBtn.onclick = () => this._showPage("home");

    header.appendChild(title);
    header.appendChild(closeBtn);

    this.btnUploadSounds = document.createElement("button");
    this.btnUploadSounds.classList.add("uploadHero");
    this.btnUploadSounds.innerHTML = `🎵 <span>Upload Sound Files</span>`;


    this.soundsCountHint = document.createElement("div");
    this.soundsCountHint.className = "countHint";
    this.soundsCountHint.textContent = "Sounds: 0";
    // Mode row
    this.soundModeRow = document.createElement("div");
    this.soundModeRow.style.display = "none";
    this.soundModeRow.style.gap = "12px";
    this.soundModeRow.style.alignItems = "center";
    this.soundModeRow.style.justifyContent = "center";

    this.btnModeSequential = document.createElement("button");
    this.btnModeSequential.textContent = "Sequential";

    this.btnModeOverload = document.createElement("button");
    this.btnModeOverload.textContent = "Overload";

    this.soundModeRow.appendChild(this.btnModeSequential);
    this.soundModeRow.appendChild(this.btnModeOverload);

    this.soundsPanel.appendChild(header);
    this.soundsPanel.appendChild(this.btnUploadSounds);
    this.soundsPanel.appendChild(this.soundsCountHint);
    this.soundsPanel.appendChild(this.soundModeRow);

    // PRIME SOUND CARD
    this.primeCard = document.createElement("div");
    this.primeCard.className = "soundCard";

    this.primeTitle = document.createElement("div");
    this.primeTitle.className = "soundCardTitle";
    this.primeTitle.textContent = "ADD A PRIME SOUND";

    this.primeHelp = document.createElement("div");
    this.primeHelp.className = "soundCardHelp";
    this.primeHelp.textContent = "This sound will play on loop indefinitely until the program ends.";

    this.primeRow = document.createElement("div");
    this.primeRow.className = "soundRow";

    this.btnUploadPrime = document.createElement("button");
    this.btnUploadPrime.className = "soundBtn";
    this.btnUploadPrime.textContent = "⬆ Upload Prime Sound";

    this.primeOr = document.createElement("div");
    this.primeOr.className = "soundOr";
    this.primeOr.textContent = "OR";

    this.btnRecordPrime = document.createElement("button");
    this.btnRecordPrime.className = "soundBtn";
    this.btnRecordPrime.textContent = "🔴 Record Your Own Sound";

    this.primeRow.appendChild(this.btnUploadPrime);
    this.primeRow.appendChild(this.primeOr);
    this.primeRow.appendChild(this.btnRecordPrime);

    this.primeCard.appendChild(this.primeTitle);
    this.primeCard.appendChild(this.primeHelp);
    this.primeCard.appendChild(this.primeRow);

    // Prime preview playbar (appears after upload/record)
    this.primePlayback = document.createElement("audio");
    this.primePlayback.className = "primePlayback";
    this.primePlayback.controls = true;
    this.primePlayback.preload = "metadata";
    this.primePlayback.style.display = "none";
    this.primePlayback.onerror = () => {
      console.warn("[PRIME PREVIEW] error:", this.primePlayback?.error);
    };
    this.primeCard.appendChild(this.primePlayback);
    this.soundsPanel.appendChild(this.primeCard);

    // =========================
    // SPEECH PANEL
    // =========================
    this.speechPanel = document.createElement("div");
    this.speechPanel.style.position = "absolute";
    this.speechPanel.style.left = "50%";
    this.speechPanel.style.top = "50%";
    this.speechPanel.style.transform = "translate(-50%, -50%)";
    this.speechPanel.style.width = "min(980px, calc(100vw - 60px))";
    this.speechPanel.style.height = "min(760px, calc(100vh - 60px))";
    this.speechPanel.style.background = "#2a3443";
    this.speechPanel.style.border = "1px solid rgba(255,255,255,0.10)";
    this.speechPanel.style.borderRadius = "18px";
    this.speechPanel.style.boxShadow = "0 22px 70px rgba(0,0,0,0.55)";
    this.speechPanel.style.padding = "18px";
    this.speechPanel.style.display = "none";
    this.speechPanel.style.flexDirection = "column";
    this.speechPanel.style.gap = "18px";
    this.speechPanel.style.zIndex = "2";

    const spHeader = document.createElement("div");
    spHeader.className = "sightsHeader";
    const spTitle = document.createElement("div");
    spTitle.className = "sightsTitle";
    spTitle.textContent = "Speech";
    const spClose = document.createElement("button");
    spClose.className = "sightsClose";
    spClose.textContent = "✕";
    spClose.onclick = () => this._showPage("home");
    spHeader.appendChild(spTitle);
    spHeader.appendChild(spClose);
    this.speechPanel.appendChild(spHeader);

    this.speechModeRow = document.createElement("div");
    this.speechModeRow.style.display = "flex";
    this.speechModeRow.style.gap = "18px";
    this.speechModeRow.style.justifyContent = "center";
    this.speechModeRow.style.alignItems = "center";

    const mkModeBtn = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.width = "140px";
      b.style.height = "140px";
      b.style.fontSize = "22px";
      b.style.fontWeight = "900";
      b.style.borderRadius = "16px";
      b.style.border = "1px solid rgba(255,255,255,0.10)";
      b.style.background = "rgba(255,255,255,0.06)";
      b.style.color = "white";
      b.style.cursor = "pointer";
      return b;
    };
    this.btnSpeechSilent = mkModeBtn("Silent");
    this.btnSpeechRepeat = mkModeBtn("Repeat");
    this.speechModeRow.appendChild(this.btnSpeechSilent);
    this.speechModeRow.appendChild(this.btnSpeechRepeat);
    this.speechPanel.appendChild(this.speechModeRow);

    // Voice selection
    this.voiceRow = document.createElement("div");
    this.voiceRow.style.display = "flex";
    this.voiceRow.style.gap = "12px";
    this.voiceRow.style.alignItems = "center";
    this.voiceRow.style.justifyContent = "center";

    const voiceLabel = document.createElement("div");
    voiceLabel.textContent = "Voice";
    voiceLabel.style.fontWeight = "900";
    voiceLabel.style.opacity = "0.9";

    this.voiceSelect = document.createElement("select");
    this.voiceSelect.style.height = "40px";
    this.voiceSelect.style.borderRadius = "12px";
    this.voiceSelect.style.border = " 1px solid rgba(0,0,0,0.25)";
    this.voiceSelect.style.background = " white";
    this.voiceSelect.style.color = " black";
    this.voiceSelect.style.padding = "0 12px";
    this.voiceSelect.style.minWidth = "320px";
    this.voiceSelect.innerHTML = `<option value="">Default system voice</option>`;

    const testVoice = document.createElement("button");
    testVoice.textContent = "Test";
    testVoice.style.height = "40px";
    testVoice.style.borderRadius = "12px";
    testVoice.style.border = "1px solid rgba(255,255,255,0.10)";
    testVoice.style.background = "rgba(255,255,255,0.06)";
    testVoice.style.color = "white";
    testVoice.style.fontWeight = "900";
    testVoice.style.cursor = "pointer";

    this.voiceRow.appendChild(voiceLabel);
    this.voiceRow.appendChild(this.voiceSelect);
    this.voiceRow.appendChild(testVoice);
    // Voice selector (shown only in Repeat mode)
    this.speechPanel.appendChild(this.voiceRow);

    // Silent strictness slider (only shown in Silent)
    this.silentRow = document.createElement("div");
    this.silentRow.style.display = "none";
    this.silentRow.style.alignItems = "center";
    this.silentRow.style.gap = "12px";
    this.silentRow.style.justifyContent = "center";

    const sLbl = document.createElement("div");
    sLbl.textContent = "Silent Strictness";
    sLbl.style.fontWeight = "900";
    sLbl.style.opacity = "0.9";

    this.silentSlider = document.createElement("input");
    this.silentSlider.type = "range";
    this.silentSlider.min = "0";
    this.silentSlider.max = "100";
    this.silentSlider.step = "1";
    this.silentSlider.value = String(this.silentStrictness);
    this.silentSlider.style.width = "420px";

    this.silentPct = document.createElement("div");
    this.silentPct.textContent = `${this.silentStrictness}%`;
    this.silentPct.style.fontWeight = "900";
    this.silentPct.style.opacity = "0.85";
    this.silentPct.style.minWidth = "48px";

    this.silentRow.appendChild(sLbl);
    this.silentRow.appendChild(this.silentSlider);
    this.silentRow.appendChild(this.silentPct);
    this.speechPanel.appendChild(this.silentRow);

    // Repeat phrase UI container (only shown in Repeat)
    this.repeatBox = document.createElement("div");
    this.repeatBox.style.display = "none";
    this.repeatBox.style.flex = "1";
    this.repeatBox.style.display = "none";
    this.repeatBox.style.flexDirection = "column";
    this.repeatBox.style.gap = "18px";
    this.repeatBox.style.minHeight = "0";
    this.repeatBox.style.overflow = "hidden";
    this.speechInputRow = document.createElement("div");
    this.speechInputRow.style.display = "flex";
    this.speechInputRow.style.gap = "10px";
    this.speechInputRow.style.alignItems = "center";

    this.speechInput = document.createElement("input");
    this.speechInput.type = "text";
    this.speechInput.placeholder = "Enter phrase...";
    this.speechInput.style.flex = "1";
    this.speechInput.style.height = "44px";
    this.speechInput.style.borderRadius = "12px";
    this.speechInput.style.border = "1px solid rgba(255,255,255,0.10)";
    this.speechInput.style.background = "rgba(0,0,0,0.18)";
    this.speechInput.style.color = "white";
    this.speechInput.style.padding = "0 14px";

    this.btnAddPhrase = document.createElement("button");
    this.btnAddPhrase.textContent = "+";
    this.btnAddPhrase.style.width = "44px";
    this.btnAddPhrase.style.height = "44px";
    this.btnAddPhrase.style.borderRadius = "12px";
    this.btnAddPhrase.style.border = "1px solid rgba(255,255,255,0.10)";
    this.btnAddPhrase.style.background = "rgba(46,160,67,0.75)";
    this.btnAddPhrase.style.color = "white";
    this.btnAddPhrase.style.fontSize = "22px";
    this.btnAddPhrase.style.fontWeight = "900";
    this.btnAddPhrase.style.cursor = "pointer";

    this.speechInputRow.appendChild(this.speechInput);
    this.speechInputRow.appendChild(this.btnAddPhrase);
    this.repeatBox.appendChild(this.speechInputRow);

    this.phraseList = document.createElement("div");
    this.phraseList.style.flex = "1";
    this.phraseList.style.border = "1px solid rgba(255,255,255,0.10)";
    this.phraseList.style.borderRadius = "14px";
    this.phraseList.style.background = "rgba(0,0,0,0.12)";
    this.phraseList.style.padding = "10px";
    this.phraseList.style.color = "white";
    this.phraseList.style.overflow = "auto";
    this.phraseList.style.minHeight = "0";
    this.phraseList.style.maxHeight = "360px";
    this.repeatBox.appendChild(this.phraseList);

    this.speechHint = document.createElement("div");
    this.speechHint.style.opacity = "0.85";
    this.speechHint.style.fontWeight = "700";
    this.speechHint.textContent = "Repeat mode: the program will ask you to repeat a phrase. Correct = bing, incorrect = buzz.";
    this.repeatBox.appendChild(this.speechHint);
    this.speechPanel.appendChild(this.repeatBox);


    // =========================

    // Fullscreen recording overlay (obvious + blocks interaction)
    this.recordOverlay = document.createElement("div");
    this.recordOverlay.id = "recordOverlay";
    Object.assign(this.recordOverlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "99999",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(120,0,0,0.92)",
      color: "white",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    });
    this.recordOverlay.innerHTML = `
      <div style="text-align:center; max-width:720px; padding:28px 24px; border:2px solid rgba(255,255,255,0.25); border-radius:18px; background:rgba(0,0,0,0.22); box-shadow:0 16px 40px rgba(0,0,0,0.35);">
        <div style="font-size:46px; font-weight:900; letter-spacing:1px; text-transform:uppercase;">● RECORDING</div>
        <div style="font-size:18px; font-weight:700; opacity:0.95; margin-top:8px;">Prime sound is being recorded right now</div>
        <div id="recTimer" style="font-size:34px; font-weight:900; margin-top:16px;">00:00</div>
        <button id="stopRecBtn" style="margin-top:22px; font-size:22px; font-weight:900; padding:14px 22px; border-radius:14px; border:2px solid rgba(255,255,255,0.35); background:rgba(0,0,0,0.25); color:white; cursor:pointer;">STOP</button>
      </div>
    `;
    this._recTimerEl = this.recordOverlay.querySelector("#recTimer");
    this.recordOverlay.querySelector("#stopRecBtn").onclick = () => this._stopPrimeRecording();
    // BIND TICK
    // =========================
    this._tick = this._tick.bind(this);
  }

  // =========================
  // WebAudio init
  // =========================
  _ensureAudioCtx() {
    if (this.audioCtx) return;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new Ctx();

    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 1.0;

    // Mild leveling (helps peaks). The real normalization is our RMS gain.
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.audioCtx.destination);
  }

  // =========================
  // Navigation
  // =========================
  _showPage(page) {
    this.ui.setPage(page);

    const isHome = page === "home";
    const isSights = page === "sights";
    const isSounds = page === "sounds";
    const isSpeech = page === "speech";

    this.homePanel.style.display = isHome ? "grid" : "none";
    this.sightsPanel.style.display = isSights ? "flex" : "none";
    this.soundsPanel.style.display = isSounds ? "flex" : "none";
    this.speechPanel.style.display = isSpeech ? "flex" : "none";
  }

  // =========================
  // Loudness helpers (RMS normalize)
  // =========================
  async _analyzeRMS(file) {
    this._ensureAudioCtx();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

    let sum = 0;
    let count = 0;

    // Stride sampling (fast). Smaller = more accurate; bigger = faster.
    const stride = 200;

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i += stride) {
        const v = data[i];
        sum += v * v;
        count++;
      }
    }

    const rms = Math.sqrt(sum / Math.max(1, count));
    return Math.max(0.001, rms);
  }

  _gainToReachTargetRms(measuredRms) {
    // Prevent insane boosts on near-silent files (which can cause "machine gun" compressor pumping).
    const safeRms = Math.max(0.001, measuredRms || 0);
    const raw = this._targetRms / safeRms;
    // Clamp: allow boost, but keep it sane.
    return Math.min(30, Math.max(0, raw));
  }

  _applyNormalTrackGainsForMode() {
    const n = Math.max(1, this._waTracks.length);

    // Overload: scale normals by 1/N so the combined "normal bed" stays ~constant.
    const modeScale = (this.soundMode === "overload") ? (1 / n) : 1;

    for (const t of this._waTracks) {
      const base = this._gainToReachTargetRms(t.rms);
      t.gain.gain.value = base * modeScale;
    }
  }

  _applyPrimeGainForMode() {
    if (!this._waPrime?.gain) return;

    // Normalize prime to target RMS, then apply prime ratio (50% louder).
    const normPrime = this._gainToReachTargetRms(this._waPrime.rms);
    this._waPrime.gain.gain.value = normPrime * this._primeRatio;
  }

  async _loadNormalSounds(files) {
    this._ensureAudioCtx();
    this._stopAllSounds({ keepLoaded: false });

    for (const f of files) {
      const rms = await this._analyzeRMS(f);

      const url = URL.createObjectURL(f);
      const a = new Audio(url);
      a.loop = false;
      a.preload = "auto";
      a.volume = 1.0; // WebAudio gain controls loudness

      const src = this.audioCtx.createMediaElementSource(a);
      const g = this.audioCtx.createGain();
      g.gain.value = this._gainToReachTargetRms(rms);

      src.connect(g);
      g.connect(this.compressor);

      this._loopAudios.push(a);
      this._waTracks.push({ audioEl: a, src, gain: g, rms, url });
    }

    this._seqIndex = 0;
    this._applyNormalTrackGainsForMode();
    this._applyPrimeGainForMode();

    this._updateSoundModeRowVisibility();
    // DO NOT auto-play; start() controls playback
  }

  async _loadPrimeSound(file) {
    this._ensureAudioCtx();
    this._stopPrime({ keepLoaded: false });

    const rms = await this._analyzeRMS(file);

    const url = URL.createObjectURL(file);
    const a = new Audio(url);
    a.loop = true;
    a.preload = "auto";
    a.volume = 1.0;

    const src = this.audioCtx.createMediaElementSource(a);
    const g = this.audioCtx.createGain();

    src.connect(g);
    g.connect(this.compressor);

    this._primeAudio = a;
    this._waPrime = { audioEl: a, src, gain: g, rms, url };

    // Prime preview playbar
    try {
      if (this.primePlayback) {
        this.primePlayback.src = url;
        this.primePlayback.style.display = "block";
        this.primePlayback.muted = false;
        this.primePlayback.volume = 1.0;
        try { this.primePlayback.load(); } catch {}
        this.primePlayback.onloadedmetadata = () => {
          console.log("[PRIME PREVIEW] duration:", this.primePlayback.duration);
        };
        this.primePlayback.oncanplay = () => {
          console.log("[PRIME PREVIEW] canplay");
        };

// Route the preview through WebAudio so we can apply the same normalization gain
// (HTMLAudioElement volume is capped at 1.0).
try {
  if (!this._primePreviewSrc) {
    this._primePreviewSrc = this.audioCtx.createMediaElementSource(this.primePlayback);
    this._primePreviewGain = this.audioCtx.createGain();
    this._primePreviewSrc.connect(this._primePreviewGain);
    this._primePreviewGain.connect(this.compressor);
  }
  // Use the SAME computed prime gain (normalized * primeRatio), but clamp again for safety.
  const previewGain = Math.min(30, Math.max(0, this._waPrime?.gain?.gain?.value ?? 1));
  this._primePreviewGain.gain.value = previewGain;
  // If the URL changed, force reload.
  this._primePreviewUrl = url;
} catch (e) {
  console.warn("[PRIME PREVIEW] webaudio route failed:", e);
}
      }
    } catch {}

    this._applyPrimeGainForMode();

    if (this.running) this._startPrime();
  }

  // =========================
  // Mount
  // =========================
  mount(parent) {
    parent.appendChild(this.root);

    this.stimulus.mount(this.root);
    // Load font (put TheReminder.woff2 in /public/fonts)
    const fontStyle = document.createElement("style");
    fontStyle.textContent = `
    @font-face {
      font-family: 'TheReminder';
      src: url('/fonts/TheReminder.woff2') format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    `;
    document.head.appendChild(fontStyle);

    // Add banner to UI
    this.root.appendChild(this.banner);
    // Load custom font (file must exist at /public/fonts/TheReminder.woff2)
    const style = document.createElement("style");
    style.textContent = `
    @font-face {
      font-family: 'TheReminder';
      src: url('/fonts/TheReminder.woff2') format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    `;
    document.head.appendChild(style);

    // Add banner to UI (visible on menus)
    this.root.appendChild(this.banner);

    this.root.appendChild(this.homePanel);
    this.root.appendChild(this.sightsPanel);
    this.root.appendChild(this.soundsPanel);
    this.root.appendChild(this.speechPanel);
    this.root.appendChild(this.controls);
    this.root.appendChild(this.recordOverlay);

    // Show HUD only while developing (hide in Cloudflare production build)
    if (import.meta.env.DEV) {
      this.hud.mount(this.root);
    }

    this.root.appendChild(this.fileInput);
    this.root.appendChild(this.imagesFolderInput);
    this.root.appendChild(this.soundsInput);
    this.root.appendChild(this.soundsFolderInput);
    this.root.appendChild(this.primeInput);


    // =========================
    // BRAND BANNER (top center)
    // =========================
    this.bannerImg = document.createElement("img");
    this.bannerImg.src = "/Mask.png";        // must be in /public
    this.bannerImg.alt = "The-Reminder";
    Object.assign(this.bannerImg.style, {
      height: "90px",
      maxWidth: "80vw",
      objectFit: "contain",
      filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.55))",
    });

    this.bannerText = document.createElement("div");
    this.bannerText.textContent = "The-Reminder";
    Object.assign(this.bannerText.style, {
      fontFamily: "'TheReminder', system-ui, sans-serif",
      fontSize: "34px",
      fontWeight: "900",
      letterSpacing: "1px",
      color: "white",
      textShadow: "0 10px 28px rgba(0,0,0,0.65)",
    });

    // Home navigation
    this.btnHomeSights.onclick = () => this._showPage("sights");
    this.btnHomeSounds.onclick = () => this._showPage("sounds");
    this.btnHomeSpeech.onclick = () => this._showPage("speech");


    // Speech controls
    this.btnSpeechSilent.onclick = () => this._toggleSpeechMode("silent");
    this.btnSpeechRepeat.onclick = () => this._toggleSpeechMode("repeat");

    this.btnAddPhrase.onclick = () => this._tryAddPhraseFromInput();
    this.speechInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        this._tryAddPhraseFromInput();
      }
    });

    this._renderSpeechButtons();
    this._renderPhraseList();

    // Voice list (populate after permissions so labels are available)
    this._refreshVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => this._refreshVoices();
    }
    this.voiceSelect.onchange = () => {
      this.speechVoiceURI = this.voiceSelect.value;
    };
    // Test voice button
    try {
      this.voiceRow.querySelector("button").onclick = () => {
        this._speak("Repeat after me. You are in control.");
      };
    } catch {}

    // Silent strictness slider
    this.silentSlider.oninput = () => {
      const v = parseInt(this.silentSlider.value, 10) || 0;
      this.silentStrictness = Math.max(0, Math.min(100, v));
      this.silentPct.textContent = `${this.silentStrictness}%`;
      this._applySilentStrictness();
    };

    // Start/Stop
    this.btnStart.onclick = async () => {
      console.log("[UI] Start clicked");
      try { await this.start(); }
      catch (e) { console.error("[START] failed:", e); }
    };
    this.btnStop.onclick = () => {
      console.log("[UI] Stop clicked");
      try { this.stop(); }
      catch (e) { console.error("[STOP] failed:", e); }
    };

    // Images
    this.btnUploadImages.onclick = () => this._showUploadChoice({ kind: "images" });

    this.fileInput.onchange = async () => {
      const files = Array.from(this.fileInput.files || []).filter(f => f.type.startsWith("image/"));
      this.fileInput.value = "";
      if (!files.length) return;
      await this.ui.addFiles(files);
      this._updateMediaCounts();
    };

    
    // Folder uploads for images
    this.imagesFolderInput.onchange = async () => {
      const files = Array.from(this.imagesFolderInput.files || []).filter(f => f.type.startsWith("image/"));
      // Decide mode based on _uploadChoiceMode
      const mode = this._uploadChoiceMode || "folder_recursive";
      this.imagesFolderInput.value = "";
      if (!files.length) return;
      const picked = this._filterFolderFiles(files, mode === "folder_recursive");
      if (!picked.length) return;
      await this.ui.addFiles(picked);
      this._updateMediaCounts();
    };

this.btnClearImages.onclick = () => { this.ui.clearImages(); this._updateMediaCounts(); };

    // Sights tiles
    this.btnEyeTile.onclick = () => this._setEyeTrackingOn(!this.requireEyesOpen);
    this.btnTrigTile.onclick = () => this._setTriggersOn(!this.triggersOn);

    // Words
    this.btnAddWord.onclick = () => this._tryAddWordFromInput();
    this.btnClearWords.onclick = () => {
      this.ui.clearWords();
      this._renderWordsList();
    };

    this.wordInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        this._tryAddWordFromInput();
      }
    });

    this._setEyeTrackingOn(this.requireEyesOpen);
    this._setTriggersOn(this.triggersOn);
    this._renderWordsList();

    // Sounds upload (normal)
    this.btnUploadSounds.onclick = () => this._showUploadChoice({ kind: "sounds" });
    this.soundsInput.onchange = async () => {
      const files = Array.from(this.soundsInput.files || []).filter(f => f.type.startsWith("audio/"));
      this.soundsInput.value = "";
      if (!files.length) return;

      await this._loadNormalSounds(files);


       this._updateMediaCounts();
      // If already running, re-start normals immediately in the new mix
      if (this.running) {
        this._stopAllSounds({ keepLoaded: true });
        this._startAllSounds();
        this._applyPrimeGainForMode();
      }

      console.log("[SOUND] Loaded:", this._loopAudios.length);
    };

    // Folder uploads for sounds
    this.soundsFolderInput.onchange = async () => {
      const files = Array.from(this.soundsFolderInput.files || []).filter(f => f.type.startsWith("audio/"));
      const mode = this._uploadChoiceMode || "folder_recursive";
      this.soundsFolderInput.value = "";
      if (!files.length) return;
      const picked = this._filterFolderFiles(files, mode === "folder_recursive");
      if (!picked.length) return;

      await this._loadNormalSounds(picked);


       this._updateMediaCounts();
      if (this.running) {
        this._stopAllSounds({ keepLoaded: true });
        this._startAllSounds();
        this._applyPrimeGainForMode();
      }

      console.log("[SOUND] Loaded:", this._loopAudios.length);
    };


    // Prime upload
    this.btnUploadPrime.onclick = () => this.primeInput.click();

    // Prime record
    this.btnRecordPrime.onclick = async () => {
      if (!this._isRecordingPrime) {
        try { await this._startPrimeRecording(); } catch (e) {
          console.warn("[PRIME REC] start failed:", e);
          this._isRecordingPrime = false;
          this._hideRecordOverlay?.();
          this.btnRecordPrime.textContent = "🔴 Record Your Own Sound";
        }
      } else {
        this._stopPrimeRecording();
      }
    };
    this.primeInput.onchange = async () => {
      const f = (this.primeInput.files && this.primeInput.files[0]) || null;
      this.primeInput.value = "";
      if (!f) return;

      await this._loadPrimeSound(f);
      console.log("[PRIME] Loaded:", f.name);
    };

    // Mode buttons
    this.btnModeSequential.onclick = () => this._setSoundMode("sequential");
    this.btnModeOverload.onclick = () => this._setSoundMode("overload");


    // If user hits ESC and exits fullscreen while running, stop the program.
    this._onFullscreenChange = () => {
      if (this.running && !document.fullscreenElement) {
        this.stop();
      }
    };
    document.addEventListener("fullscreenchange", this._onFullscreenChange);

    this._setSoundMode(this.soundMode);
    this._updateSoundModeRowVisibility();

    this._showPage("home");
    this._updateMediaCounts();
    requestAnimationFrame(this._tick);
  }

  // =========================
  // Sights UI behavior
  // =========================
  _setEyeTrackingOn(on) {
    this.requireEyesOpen = !!on;
    this.btnEyeTile.classList.toggle("isOn", this.requireEyesOpen);
  }

  _setTriggersOn(on) {
    this.triggersOn = !!on;
    this.btnTrigTile.classList.toggle("isOn", this.triggersOn);
    this.wordsCard.classList.toggle("hidden", !this.triggersOn);
    this.ui.setFlashEnabled(this.triggersOn);
  }

  _tryAddWordFromInput() {
    const raw = this.wordInput.value;
    if (this.ui.addWord(raw)) {
      this.wordInput.value = "";
      this._renderWordsList();
    }
  }

    _renderWordsList() {
    if (!this.wordsList) return;
    this.wordsList.innerHTML = "";
    const ws = this.ui.words || [];

    if (!ws.length) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.75";
      empty.style.padding = "10px";
      empty.style.color = "white";
      empty.textContent = "No triggers yet. Add a word above.";
      this.wordsList.appendChild(empty);
      return;
    }

    ws.forEach((w, idx) => {
      const row = document.createElement("div");
      row.className = "wordItem";

      const del = document.createElement("button");
      del.className = "wordRemove";
      del.textContent = "✖";
      del.title = "Remove";
      del.onclick = () => {
        this.ui.removeWordAt(idx);
        this._renderWordsList();
      };

      const txt = document.createElement("div");
      txt.style.flex = "1";
      txt.style.color = "white";
      txt.style.fontWeight = "900";
      txt.style.letterSpacing = "0.3px";
      txt.textContent = w;

      row.appendChild(del);
      row.appendChild(txt);
      this.wordsList.appendChild(row);
    });
  }

  // =========================
  async _ensureFullscreen() {
  if (document.fullscreenElement) return true;
  try {
    // Use your root so it’s consistent
    await this.root.requestFullscreen();
    return true;
  } catch (e) {
    // Fullscreen can fail due to permission prompts / browser rules
    return false;
  }
}

  // Run control
  // =========================
  async start() {
    if (this.running) return;

    this._ensureFullscreen();
    // Resume AudioContext on user gesture
    this._ensureAudioCtx();
    try { await this.audioCtx.resume(); } catch {}

    this._frames = 0;
    this._visionError = "";
    this.ui.startSlideshow(performance.now());

    try { await this.mic.start(); } catch (e) { console.warn("Mic start failed:", e); }
    if (this.requireEyesOpen) {
      try { await this.vision.start(); } catch (e) {
      this._visionError = String(e?.message || e);
        console.warn("Vision start failed:", e);
      }
    } else {
      try { this.vision.stop(); } catch {}
    }

    try { this.stimulus.resize(); } catch {}

    this._eyeGraceUntil = performance.now() + this.eyeGraceMs;
    this.running = true;
    // Hide header + start button while running
    if (this.banner) this.banner.style.display = "none";
    if (this.controls) this.controls.style.display = "none";
    // If a picker overlay is somehow left open, force-hide it so it can’t block clicks.
    try {
      const ov = document.querySelector(".pickOverlay");
      if (ov) ov.style.display = "none";
    } catch {}

    // Start audio ONLY on Start
    this._startAllSounds();
    this._startPrime();

    // Speech game start
    if (this.speechMode === "repeat") {
      this._startRepeatGameLoop();
    }

    // Hide menus while running
    if (this.banner) this.banner.style.display = "none";
    this.homePanel.style.display = "none";
    this.sightsPanel.style.display = "none";
    this.soundsPanel.style.display = "none";

    this.btnStart.disabled = true;
    this.btnStop.disabled = false;
    // Hide header + start controls while running
    if (this.banner) this.banner.style.display = "none";
    if (this.controls) this.controls.style.display = "none";
  }

  stop() {
    this.homePanel.style.display = "grid";
    this.sightsPanel.style.display = "none";
    this.soundsPanel.style.display = "none";

    this.running = false;

    try { this.mic.stop(); } catch {}
    try { this.vision.stop(); } catch {}

    try { this._stopAllSounds({ keepLoaded: true }); } catch {}
    try { this._stopPrime({ keepLoaded: true }); } catch {}

    // Stop speech game
    this._stopRepeatGame();

    this.btnStart.disabled = false;
    this.btnStop.disabled = true;

    if (this.banner) this.banner.style.display = "flex";
    this.controls.style.display = "flex";
    // Show header + start button again
    if (this.banner) this.banner.style.display = "flex";
    if (this.controls) this.controls.style.display = "flex";
    this._showPage("home");
  }

  // =========================
  // Tick/render
  // =========================
  _tick() {
    const nowMs = performance.now();
    const nowS = nowMs / 1000;

    let micState = { rms: 0, fail: false };
    let hasFace = false;
    let eyesOk = false;

    let eyesFail = false;
    let showEyesClosedScreen = false;

    if (this.running) {
      micState = this.mic.update(nowMs);

      // Silent speech game: any noise triggers a fail buzz (edge-triggered + cooldown)
      if (this.speechMode === "silent") {
        const isFail = !!micState.fail;
        const now = nowMs;
        if (isFail && !this._silentWasFail) {
          if ((now - (this._silentLastBuzzMs || 0)) > 650) {
            this._playBuzz();
            this._silentLastBuzzMs = now;
          }
          this._speechHudLine = `NOISE! rms=${micState.rms.toFixed(3)}`;
        }
        this._silentWasFail = isFail;
      }

      this.vision.update(nowMs);
      hasFace = this.vision.hasFace;
      eyesOk = this.vision.eyesOk;

      const inEyeGrace = nowMs < this._eyeGraceUntil;

      if (hasFace) {
        this.eyeTrigger.update(eyesOk, nowS);
      }

      eyesFail = this.requireEyesOpen && !inEyeGrace && (!hasFace || !eyesOk);
      showEyesClosedScreen = eyesFail;

      if (!showEyesClosedScreen) {
        this.ui.updateSlideshow(nowMs);
      }
    }

    const img = (this.running && !showEyesClosedScreen) ? this.ui.currentImage() : null;
    const overlayText = (this.running && !showEyesClosedScreen) ? this.ui.currentOverlayText() : null;

    this.stimulus.render({
      img,
      eyesClosed: showEyesClosedScreen,
      overlayText,
    });

    const hudLines = [
      `RUNNING: ${this.running}`,
      `MIC rms=${micState.rms.toFixed(4)} fail=${micState.fail}`,
      this.vision.statusLine(),
      this._visionError ? `VISION ERROR: ${this._visionError}` : "",
      this._speechHudLine ? `SPEECH: ${this._speechHudLine}` : "",
      `EYES_REQUIRED: ${this.requireEyesOpen}`,
      `EYES_FAIL: ${eyesFail}`,
      `TRIGGERS: ${this.triggersOn} flashEnabled=${this.ui.flashEnabled}`,
      `SOUNDS: ${this._loopAudios.length} mode=${this.soundMode}`,
      `PRIME: ${this._primeAudio ? "loaded" : "none"}`,
      `TARGET_RMS: ${this._targetRms} PRIME_RATIO: ${this._primeRatio}`,
    ].filter(Boolean);

    this.hud.set(hudLines.join("\n"));
    requestAnimationFrame(this._tick);
  }

  // =========================
  // Sounds: mode + start/stop
  // =========================
  _updateSoundModeRowVisibility() {
    const hasSounds = this._loopAudios && this._loopAudios.length > 0;
    this.soundModeRow.style.display = hasSounds ? "flex" : "none";
  }

  _setSoundMode(mode) {
    this.soundMode = (mode === "sequential") ? "sequential" : "overload";

    const on = (btn) => { btn.style.background = "rgba(46,160,67,0.40)"; };
    const off = (btn) => { btn.style.background = "rgba(255,255,255,0.06)"; };

    if (this.soundMode === "sequential") {
      on(this.btnModeSequential);
      off(this.btnModeOverload);
    } else {
      on(this.btnModeOverload);
      off(this.btnModeSequential);
    }

    // Re-apply mix immediately
    this._applyNormalTrackGainsForMode();
    this._applyPrimeGainForMode();

    if (this.running) {
      this._stopAllSounds({ keepLoaded: true });
      this._startAllSounds();
      // prime continues (but ensure gain updated)
      this._applyPrimeGainForMode();
    }
  }


  // =========================
  // Prime recording (MediaRecorder)
  // =========================
  _showRecordOverlay() {
    if (!this.recordOverlay) return;
    this.recordOverlay.style.display = "flex";
    this._recStartTime = performance.now();
    clearInterval(this._recTimerInterval);
    this._recTimerInterval = setInterval(() => {
      const sec = Math.floor((performance.now() - this._recStartTime) / 1000);
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      if (this._recTimerEl) this._recTimerEl.textContent = `${m}:${s}`;
    }, 200);
  }

  _hideRecordOverlay() {
    if (!this.recordOverlay) return;
    this.recordOverlay.style.display = "none";
    clearInterval(this._recTimerInterval);
    this._recTimerInterval = null;
  }

  async _startPrimeRecording() {
    if (this._isRecordingPrime) return;
    this._ensureAudioCtx();
    try { await this.audioCtx.resume(); } catch {}

    // Request mic
    // Use Windows system default input device
    this._recStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    // Log which mic is actually being used
    const track = this._recStream.getAudioTracks()[0];
    if (track) {
      const settings = track.getSettings();
      console.log("[PRIME REC] using mic:", settings.deviceId || "default");
    };

    // Live RMS sampler (does not output sound)
    this._recRmsSumSq = 0;
    this._recRmsN = 0;
    this._recSrcNode = this.audioCtx.createMediaStreamSource(this._recStream);
    const Proc = this.audioCtx.createScriptProcessor ? this.audioCtx.createScriptProcessor(2048, 1, 1) : null;
    this._recRmsNode = Proc;
    this._recZeroGain = this.audioCtx.createGain();
    this._recZeroGain.gain.value = 0;

    if (this._recRmsNode) {
      this._recRmsNode.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
        this._recRmsSumSq += sum;
        this._recRmsN += ch.length;
      };
      this._recSrcNode.connect(this._recRmsNode);
      this._recRmsNode.connect(this._recZeroGain);
      this._recZeroGain.connect(this.audioCtx.destination);
    }

    // Choose mime
    let mimeType = "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
    }

    this._recChunks = [];
    this._recorder = new MediaRecorder(this._recStream, mimeType ? { mimeType } : undefined);
    console.log("[PRIME REC] started", { mimeType: this._recorder.mimeType });

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._recChunks.push(e.data);
    };

    this._recorder.onstop = async () => {
      try {
        const blob = new Blob(this._recChunks, { type: this._recorder?.mimeType || "audio/webm" });
        console.log("[PRIME REC] blob", { type: blob.type, size: blob.size, chunks: this._recChunks.length });

        // Store live RMS fallback
        if (this._recRmsN > 0) {
          this._lastRecordedPrimeRms = Math.sqrt(this._recRmsSumSq / this._recRmsN) || 0;
          console.log("[PRIME REC] live RMS", this._lastRecordedPrimeRms);
        }

        let fileToLoad = null;

        try {
          // Decode -> trim -> WAV encode (removes the startup "exhale" permanently)
          const arr = await blob.arrayBuffer();
          const decoded = await this.audioCtx.decodeAudioData(arr);

          const trimmed = this._trimAudioBuffer(decoded, 200); // try 120ms; can bump to 160ms
          const wavBlob = this._audioBufferToWavBlob(trimmed);

          fileToLoad = new File([wavBlob], "prime_recording_trimmed.wav", { type: "audio/wav" });
          console.log("[PRIME REC] trimmed+wav OK", { size: wavBlob.size });
        } catch (e) {
          // Fallback: if decode fails, use original blob
          console.warn("[PRIME REC] trim/decode failed; using original recording:", e);
          const ext = blob.type.includes("ogg") ? "ogg" : "webm";
          fileToLoad = new File([blob], `prime_recording.${ext}`, { type: blob.type });
        }

        await this._loadPrimeSound(fileToLoad);
        // Try a one-time preview autoplay (we're still in the user-gesture stop flow in most browsers)
        try {
          if (this.primePlayback) {
            this.primePlayback.currentTime = 0;
            await this.primePlayback.play();
            console.log("[PRIME PREVIEW] autoplay ok");
          }
        } catch (e) {
          console.warn("[PRIME PREVIEW] autoplay blocked/failed:", e);
        }
      } catch (e) {
        console.warn("[PRIME REC] onstop failed:", e);
      } finally {
        this._cleanupPrimeRecordingNodes();
        this.btnRecordPrime.textContent = "🔴 Record Your Own Sound";
        this._hideRecordOverlay();
      }
    };

    // start with timeslice so data reliably arrives
    this._recorder.start(250);
    this._isRecordingPrime = true;
    this.btnRecordPrime.textContent = "⏹ Stop Recording";
    this._showRecordOverlay();
  }

  _stopPrimeRecording() {
    if (!this._isRecordingPrime) return;
    this._isRecordingPrime = false;
    try { this._recorder?.stop(); } catch {}
    try { this._recStream?.getTracks()?.forEach(t => t.stop()); } catch {}
    this._hideRecordOverlay();
  }

  _cleanupPrimeRecordingNodes() {
    try { this._recSrcNode?.disconnect(); } catch {}
    try { this._recRmsNode?.disconnect(); } catch {}
    try { this._recZeroGain?.disconnect(); } catch {}
    this._recSrcNode = null;
    this._recRmsNode = null;
    this._recZeroGain = null;
    this._recStream = null;
    this._recorder = null;
    this._recChunks = [];
    this._recRmsSumSq = 0;
    this._recRmsN = 0;
  }
  _startAllSounds() {
    if (!this._loopAudios.length) return;

    // Ensure mix is correct right before playback
    this._applyNormalTrackGainsForMode();
    this._applyPrimeGainForMode();

    if (this.soundMode === "overload") {
      for (const a of this._loopAudios) {
        a.onended = null;
        a.loop = true;
        a.currentTime = 0;
              this._waitCanPlay(a).then(() => {
        if (!this.running) return;
        a.play().catch(() => {
          // Avoid rapid-fire retries ("machine gun")
          setTimeout(() => { if (this.running) a.play().catch(() => {}); }, 150);
        });
      });
      }
      return;
    }

    // Sequential
    for (const a of this._loopAudios) {
      a.loop = false;
      a.pause();
      a.currentTime = 0;
      a.onended = null;
    }

    const playNext = () => {
      if (!this.running) return;
      if (token !== this._seqToken) return;

      const a = this._loopAudios[this._seqIndex];
      if (!a) return;

      // Wait until the element is actually ready; avoids rapid-fire glitches ("machine gun")
      this._waitCanPlay(a).then(() => {
        if (!this.running) return;
        if (token !== this._seqToken) return;

        // Ensure we don't keep stacking ended handlers
        a.onended = () => {
          if (token !== this._seqToken) return;
          this._seqIndex = (this._seqIndex + 1) % this._loopAudios.length;
          playNext();
        };

        a.play().catch((e) => {
          // Back off instead of tight retry loops
          setTimeout(() => {
            if (!this.running) return;
            if (token !== this._seqToken) return;
            a.play().catch(() => {});
          }, 150);
        });
      });
    };

    // reset + bump token so old callbacks can't fire
    this._seqIndex = 0;
    const token = ++this._seqToken;
    playNext();
  }

  _stopAllSounds({ keepLoaded } = { keepLoaded: true }) {
    for (const a of this._loopAudios) {
      try {
        a.pause();
        a.currentTime = 0;
        a.onended = null;
      } catch {}
    }

    if (!keepLoaded) {
      for (const t of this._waTracks) {
        try { t.src.disconnect(); } catch {}
        try { t.gain.disconnect(); } catch {}
        try { if (t.url?.startsWith("blob:")) URL.revokeObjectURL(t.url); } catch {}
      }
      this._waTracks = [];
      this._loopAudios = [];
      this._seqIndex = 0;
    }
  }

_startPrime() {
  if (!this._primeAudio || !this._waPrime?.gain?.gain) return;

  // 1) Set the correct target gain first (this sets gain.value)
  this._applyPrimeGainForMode();

  // 2) Fade-in to mask startup artifacts
  const t0 = this.audioCtx.currentTime;
  const g = this._waPrime.gain.gain;
  const target = g.value;

  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.linearRampToValueAtTime(target, t0 + 0.08);

  // 3) Play
  try {
    this._primeAudio.loop = true;
    if (this._primeAudio.paused) this._primeAudio.currentTime = 0;
    this._primeAudio.play().catch(() => {});
  } catch {}
}
  _stopPrime({ keepLoaded } = { keepLoaded: true }) {
    if (this._primeAudio) {
      try {
        this._primeAudio.pause();
        this._primeAudio.currentTime = 0;
      } catch {}
    }

    if (!keepLoaded) {
      // Also clear preview UI
      if (this.primePlayback) { try { this.primePlayback.pause(); } catch {} this.primePlayback.removeAttribute('src'); this.primePlayback.load?.(); this.primePlayback.style.display = 'none'; }
      if (this._waPrime) {
        try { this._waPrime.src.disconnect(); } catch {}
        try { this._waPrime.gain.disconnect(); } catch {}
        try { if (this._waPrime.url?.startsWith("blob:")) URL.revokeObjectURL(this._waPrime.url); } catch {}
      }
      this._waPrime = null;
      this._primeAudio = null;
    }
  }
  // Wait until an <audio> element has buffered enough to play without thrashing.
  _waitCanPlay(audioEl, timeoutMs = 1500) {
    return new Promise((resolve) => {
      try {
        if (!audioEl) return resolve();
        if (audioEl.readyState >= 2) return resolve(); // HAVE_CURRENT_DATA

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { audioEl.removeEventListener("canplay", onOk); } catch {}
          try { audioEl.removeEventListener("loadeddata", onOk); } catch {}
          try { audioEl.removeEventListener("error", onErr); } catch {}
          resolve();
        };

        const onOk = () => finish();
        const onErr = () => finish();

        audioEl.addEventListener("canplay", onOk, { once: true });
        audioEl.addEventListener("loadeddata", onOk, { once: true });
        audioEl.addEventListener("error", onErr, { once: true });

        setTimeout(finish, timeoutMs);
      } catch {
        resolve();
      }
    });
  }
  async _getWebcamMicDeviceId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    console.log("Available mics:", mics);

    // Adjust this match to your webcam's label
    const webcam = mics.find(d =>
      d.label.toLowerCase().includes("webcam") ||
      d.label.toLowerCase().includes("usb")
    );

    return webcam?.deviceId || null;
  }

  // =========================
  // SPEECH: UI + repeat game
  // =========================
  _toggleSpeechMode(mode) {
    const cur = this.speechMode || "none";
    if (cur === mode) {
      this.speechMode = "none";
    } else {
      this.speechMode = mode;
    }

    // Mutual exclusion with ability to be "none"
    if (this.speechMode !== "repeat") this._stopRepeatGame();

    // Silent mode threshold override
    if (this.speechMode === "silent") {
      this._micBaseThreshold = this._micBaseThreshold ?? this.mic.threshold;
      this._applySilentStrictness();
    } else {
      if (this._micBaseThreshold != null) this.mic.threshold = this._micBaseThreshold;
      this._silentWasFail = false;
    }

    this._renderSpeechButtons();
  }

  _renderSpeechButtons() {
    const on = (btn) => { btn.style.background = "rgba(46,160,67,0.75)"; };
    const off = (btn) => { btn.style.background = "rgba(255,255,255,0.06)"; };

    if (this.speechMode === "silent") {
      on(this.btnSpeechSilent); off(this.btnSpeechRepeat);
    } else if (this.speechMode === "repeat") {
      on(this.btnSpeechRepeat); off(this.btnSpeechSilent);
    } else {
      off(this.btnSpeechSilent); off(this.btnSpeechRepeat);
    }

    // Toggle sections
    if (this.silentRow) this.silentRow.style.display = (this.speechMode === "silent") ? "flex" : "none";
    if (this.voiceRow) this.voiceRow.style.display = (this.speechMode === "repeat") ? "flex" : "none";
    if (this.repeatBox) this.repeatBox.style.display = (this.speechMode === "repeat") ? "flex" : "none";
  }

  _tryAddPhraseFromInput() {
    const raw = (this.speechInput?.value || "").trim();
    if (!raw) return;
    this.speechInput.value = "";
    this.speechPhrases.push(raw);
    this._renderPhraseList();
  }

  _renderPhraseList() {
    if (!this.phraseList) return;
    this.phraseList.innerHTML = "";

    if (!this.speechPhrases.length) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.75";
      empty.style.color = "white";
      empty.style.padding = "10px";
      empty.style.color = "white";
      empty.textContent = "No phrases yet. Add one above.";
      this.phraseList.appendChild(empty);
      return;
    }

    this.speechPhrases.forEach((p, idx) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "8px 8px";
      row.style.borderBottom = "1px solid rgba(255,255,255,0.06)";

      const del = document.createElement("button");
      del.textContent = "✖";
      del.style.width = "30px";
      del.style.height = "30px";
      del.style.borderRadius = "10px";
      del.style.border = "1px solid rgba(255,255,255,0.10)";
      del.style.background = "rgba(220,50,50,0.65)";
      del.style.color = "white";
      del.style.cursor = "pointer";
      del.onclick = () => {
        this.speechPhrases.splice(idx, 1);
        this._renderPhraseList();
      };

      const txt = document.createElement("div");
      txt.style.flex = "1";
      txt.style.fontWeight = "800";
      txt.style.opacity = "0.95";
      txt.style.color = "white";
       txt.style.color = "white";
       txt.textContent = p;

      row.appendChild(del);
      row.appendChild(txt);
      this.phraseList.appendChild(row);
    });
  }

  _startRepeatGameLoop() {
    const token = ++this._repeatStopToken;

    const loop = async () => {
      while (this.running && this.speechMode === "repeat" && token === this._repeatStopToken) {
        if (!this.speechPhrases.length) {
          await this._sleep(300);
          continue;
        }
        const phrase = this._pickNextPhrase();
        await this._runRepeatRound(phrase, token);
        await this._sleep(350);
      }
    };

    loop();
  }

  _stopRepeatGame() {
    this._repeatStopToken++;
    this._cancelSpeech();
    this._stopListening();
    this._speechHudLine = "";
  }

  _pickNextPhrase() {
    this._repeatPickIndex = (this._repeatPickIndex ?? -1) + 1;
    if (this._repeatPickIndex >= this.speechPhrases.length) this._repeatPickIndex = 0;
    return this.speechPhrases[this._repeatPickIndex];
  }

  async _runRepeatRound(targetPhrase, token) {
    if (!targetPhrase) return false;

    this._speechHudLine = `REPEAT: "${targetPhrase}"`;

    // Prompt via TTS
    await this._speak(`Repeat: ${targetPhrase}`);

    if (!this.running || this.speechMode !== "repeat" || token !== this._repeatStopToken) return false;

    const heard = await this._listenOnce({ timeoutMs: 6500 });
    const ok = this._isPhraseMatch(heard, targetPhrase);

    this._speechHudLine = ok ? "✅ Correct!" : `❌ Heard: "${heard || "(nothing)"}"`;

    if (ok) this._playBing();
    else this._playBuzz();

    return ok;
  }


  _refreshVoices() {
    if (!this.voiceSelect || !("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices?.() || [];
    // rebuild options
    const current = this.speechVoiceURI || "";
    this.voiceSelect.innerHTML = `<option value="">Default system voice</option>`;
    for (const v of voices) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI || "";
      opt.textContent = `${v.name} — ${v.lang}`;
      this.voiceSelect.appendChild(opt);
    }

    // Auto-pick a nicer (often female) voice the first time
    if (!this._didAutoPickVoice && voices.length) {
      const prefer = (vv) => {
        const n = (vv.name || "").toLowerCase();
        return (
          // common "nicer" voices
          n.includes("google") ||
          n.includes("natural") ||
          n.includes("neural") ||
          // common female-ish names on Windows/Edge
          n.includes("zira") ||
          n.includes("jenny") ||
          n.includes("aria") ||
          n.includes("susan")
        );
      };
      const en = voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
      const pick = (en.find(prefer) || voices.find(prefer) || en[0] || voices[0]);
      if (pick?.voiceURI) this.speechVoiceURI = pick.voiceURI;
      this._didAutoPickVoice = true;
    }

    // Apply selection to dropdown
    this.voiceSelect.value = this.speechVoiceURI || current || "";
  }

  _applySilentStrictness() {
    // Map strictness 0..100 -> threshold 0.08 .. 0.005 (higher strictness => lower threshold)
    const tMin = 0.005;
    const tMax = 0.08;
    const x = (this.silentStrictness || 0) / 100;
    const thr = tMax - (tMax - tMin) * x;

    // Only override mic threshold while silent mode is active
    if (this.speechMode === "silent") {
      this.mic.threshold = thr;
    }
  }


  async _speak(text) {
    try {
      if (!("speechSynthesis" in window)) return;
      this._cancelSpeech();
      await this._sleep(60);

      const u = new SpeechSynthesisUtterance(text);
      // Apply selected voice (if available)
      try {
        const want = this.speechVoiceURI;
        if (want) {
          const voices = window.speechSynthesis.getVoices?.() || [];
          const v = voices.find(vv => vv.voiceURI === want);
          if (v) u.voice = v;
        }
      } catch {}
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      this._ttsUtter = u;

      const done = new Promise((res) => {
        u.onend = () => res();
        u.onerror = () => res();
      });

      window.speechSynthesis.speak(u);
      await Promise.race([done, this._sleep(4500)]);
    } catch {}
  }

  _cancelSpeech() {
    try { window.speechSynthesis?.cancel?.(); } catch {}
    this._ttsUtter = null;
  }

  _listenOnce({ timeoutMs = 6500 } = {}) {
    return new Promise((resolve) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve("");

      this._stopListening();

      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      let done = false;
      const finish = (text) => {
        if (done) return;
        done = true;
        try { rec.stop(); } catch {}
        resolve(text || "");
      };

      const t = setTimeout(() => finish(""), timeoutMs);

      rec.onresult = (e) => {
        clearTimeout(t);
        const text = e?.results?.[0]?.[0]?.transcript || "";
        finish(text);
      };
      rec.onerror = () => { clearTimeout(t); finish(""); };
      rec.onend = () => { clearTimeout(t); if (!done) finish(""); };

      try {
        rec.start();
        this._activeSpeechRec = rec;
      } catch {
        clearTimeout(t);
        finish("");
      }
    });
  }

  _stopListening() {
    try { this._activeSpeechRec?.stop?.(); } catch {}
    this._activeSpeechRec = null;
  }

  _normText(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  _isPhraseMatch(heard, target) {
    const a = this._normText(heard);
    const b = this._normText(target);
    if (!a || !b) return false;

    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    const A = new Set(a.split(" "));
    const B = new Set(b.split(" "));
    let inter = 0;
    for (const w of B) if (A.has(w)) inter++;
    const overlap = inter / Math.max(1, B.size);
    return overlap >= 0.85;
  }

  _playTone(freq, ms, gainValue = 0.16) {
    this._ensureAudioCtx();
    const t0 = this.audioCtx.currentTime;

    const o = this.audioCtx.createOscillator();
    const g = this.audioCtx.createGain();

    o.type = "sine";
    o.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(Math.max(0.0001, gainValue), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);

    o.connect(g);
    g.connect(this.compressor);

    o.start(t0);
    o.stop(t0 + ms / 1000);
  }

  _playBing() {
    this._playTone(880, 150, 0.18);
    setTimeout(() => this._playTone(1320, 120, 0.16), 90);
  }

  _playBuzz() {
    this._playTone(120, 320, 0.22);
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  _audioBufferToWavBlob(buffer) {
    // 16-bit PCM WAV
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;

    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;

    const ab = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(ab);

    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };

    writeStr(0, "RIFF");
    dv.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    dv.setUint32(16, 16, true);              // PCM
    dv.setUint16(20, 1, true);               // format
    dv.setUint16(22, numCh, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, byteRate, true);
    dv.setUint16(32, blockAlign, true);
    dv.setUint16(34, 16, true);              // bits
    writeStr(36, "data");
    dv.setUint32(40, dataSize, true);

    // Interleave channels
    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        let s = buffer.getChannelData(ch)[i];
        // clamp
        s = Math.max(-1, Math.min(1, s));
        // float -> int16
        dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([ab], { type: "audio/wav" });
  }

  _trimAudioBuffer(buffer, trimMs = 120) {
    const trimSamples = Math.floor(buffer.sampleRate * (trimMs / 1000));
    const start = Math.min(trimSamples, buffer.length);
    const newLen = Math.max(1, buffer.length - start);

    const out = this.audioCtx.createBuffer(buffer.numberOfChannels, newLen, buffer.sampleRate);

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src.subarray(start, start + newLen));
    }
    return out;
  }
  // =========================
  // Upload choice modal (Files / Folder / Folder+Subfolders)
  // =========================
  _showUploadChoice({ kind }) {
    // kind: "images" | "sounds"
    // Simple JS-styled modal so it works even if CSS changes.
    if (!this._uploadOverlay) {
      const ov = document.createElement("div");
      ov.style.position = "fixed";
      ov.style.inset = "0";
      ov.style.zIndex = "500";
      ov.style.display = "none";
      ov.style.alignItems = "center";
      ov.style.justifyContent = "center";
      ov.style.background = "rgba(0,0,0,0.55)";
      ov.style.backdropFilter = "blur(2px)";

      const card = document.createElement("div");
      card.style.width = "min(560px, 92vw)";
      card.style.borderRadius = "18px";
      card.style.padding = "18px";
      card.style.background = "#1f2a3a";
      card.style.border = "1px solid rgba(255,255,255,0.10)";
      card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.55)";

      const title = document.createElement("div");
      title.style.fontSize = "18px";
      title.style.fontWeight = "800";
      title.style.color = "white";
      title.style.marginBottom = "10px";
      title.textContent = "Upload";

      const sub = document.createElement("div");
      sub.style.fontSize = "13px";
      sub.style.opacity = "0.85";
      sub.style.color = "white";
      sub.style.marginBottom = "14px";
      sub.textContent = "Choose how you want to select files.";

      const btnRow = document.createElement("div");
      btnRow.style.display = "grid";
      btnRow.style.gridTemplateColumns = "1fr";
      btnRow.style.gap = "10px";

      const mkBtn = (label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.height = "52px";
        b.style.borderRadius = "14px";
        b.style.border = "1px solid rgba(255,255,255,0.12)";
        b.style.background = "rgba(255,255,255,0.06)";
        b.style.color = "white";
        b.style.fontSize = "16px";
        b.style.fontWeight = "800";
        b.style.cursor = "pointer";
        b.onmouseenter = () => (b.style.background = "rgba(255,255,255,0.10)");
        b.onmouseleave = () => (b.style.background = "rgba(255,255,255,0.06)");
        return b;
      };

      const btnFiles = mkBtn("Select Files");
      const btnFolder = mkBtn("Select Folder (top-level only)");
      const btnFolderRec = mkBtn("Select Folder (include subfolders)");

      const footer = document.createElement("div");
      footer.style.display = "flex";
      footer.style.justifyContent = "flex-end";
      footer.style.marginTop = "14px";

      const btnCancel = mkBtn("Cancel");
      btnCancel.style.height = "44px";
      btnCancel.style.width = "140px";
      btnCancel.style.fontSize = "15px";
      btnCancel.style.fontWeight = "800";

      footer.appendChild(btnCancel);

      btnRow.appendChild(btnFiles);
      btnRow.appendChild(btnFolder);
      btnRow.appendChild(btnFolderRec);

      card.appendChild(title);
      card.appendChild(sub);
      card.appendChild(btnRow);
      card.appendChild(footer);

      ov.appendChild(card);
      this.root.appendChild(ov);

      // close on backdrop click
      ov.addEventListener("click", (e) => {
        if (e.target === ov) this._hideUploadChoice();
      });

      btnCancel.onclick = () => this._hideUploadChoice();

      this._uploadOverlay = ov;
      this._uploadTitle = title;
      this._uploadSub = sub;
      this._uploadBtnFiles = btnFiles;
      this._uploadBtnFolder = btnFolder;
      this._uploadBtnFolderRec = btnFolderRec;
    }

    const isImages = kind === "images";
    this._uploadChoiceKind = kind;

    this._uploadTitle.textContent = isImages ? "Upload Images" : "Upload Sounds";
    this._uploadSub.textContent = isImages
      ? "Choose image files, a folder, or a folder with subfolders."
      : "Choose audio files, a folder, or a folder with subfolders.";

    this._uploadBtnFiles.onclick = () => {
      this._uploadChoiceMode = "files";
      this._hideUploadChoice();
      if (isImages) this.fileInput.click();
      else this.soundsInput.click();
    };

    this._uploadBtnFolder.onclick = () => {
      this._uploadChoiceMode = "folder_flat";
      this._hideUploadChoice();
      if (isImages) this.imagesFolderInput.click();
      else this.soundsFolderInput.click();
    };

    this._uploadBtnFolderRec.onclick = () => {
      this._uploadChoiceMode = "folder_recursive";
      this._hideUploadChoice();
      if (isImages) this.imagesFolderInput.click();
      else this.soundsFolderInput.click();
    };

    this._uploadOverlay.style.display = "flex";
  }

  _hideUploadChoice() {
    if (this._uploadOverlay) this._uploadOverlay.style.display = "none";
  }

  _filterFolderFiles(files, recursive) {
    // When selecting a folder, browsers expose webkitRelativePath like:
    // "Folder/sub/file.png". For top-level only we keep only paths with one slash.
    if (recursive) return files;
    const out = [];
    for (const f of files) {
      const rel = f.webkitRelativePath || "";
      // keep only direct children of root folder: "Root/filename.ext"
      if (rel && rel.split("/").length === 2) out.push(f);
      else if (!rel) out.push(f); // fallback, shouldn't happen
    }
    return out;
  }

  _updateMediaCounts() {
    // Images
    try {
      const nImg = (this.ui?.images?.length) || 0;
      if (this.imagesCountHint) this.imagesCountHint.textContent = `Images: ${nImg}`;
    } catch {}

    // Sounds
    try {
      const nSnd = (this._loopAudios?.length) || 0;
      if (this.soundsCountHint) this.soundsCountHint.textContent = `Sounds: ${nSnd}`;
    } catch {}
  }


}

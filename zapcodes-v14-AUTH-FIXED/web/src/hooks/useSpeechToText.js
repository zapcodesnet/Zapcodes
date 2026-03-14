/**
 * useSpeechToText.js
 * Voice input hook — APPEND MODE by default.
 * New speech always ADDS to existing text. Never overwrites.
 * 5-second silence auto-stops recording.
 * Works in Chrome, Edge, Safari. Hidden gracefully on Firefox.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

export function useSpeechToText({
  onResult,
  silenceTimeoutMs = 5000,
  lang = 'en-US',
} = {}) {
  const [isListening,  setIsListening]  = useState(false);
  const [isSupported,  setIsSupported]  = useState(false);
  const [error,        setError]        = useState(null);
  const [interimText,  setInterimText]  = useState('');

  const recognitionRef  = useRef(null);
  const silenceTimerRef = useRef(null);
  const baseTextRef     = useRef(''); // text that existed BEFORE mic was turned on

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    }, silenceTimeoutMs);
  }, [silenceTimeoutMs, clearSilenceTimer]);

  /**
   * startListening — accepts existingText so new speech appends to it.
   * Always call with the current value of the input being recorded into.
   */
  const startListening = useCallback((existingText = '') => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setError(null);
    setInterimText('');

    // Save what was already in the box — we'll append new speech to this
    const base = existingText.trim();
    baseTextRef.current = base;

    const recognition = new SR();
    recognition.continuous      = false;
    recognition.interimResults  = true;
    recognition.lang             = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      resetSilenceTimer();
    };

    recognition.onresult = (event) => {
      resetSilenceTimer();

      let interim = '';
      let finalPart = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalPart += transcript + ' ';
        } else {
          interim += transcript;
        }
      }

      if (finalPart) {
        // Append final speech to base text
        const separator = base.length > 0 ? ' ' : '';
        const fullText  = base + separator + finalPart.trim();
        baseTextRef.current = fullText;
        setInterimText('');
        if (onResult) onResult(fullText, false);
      } else if (interim) {
        // Show interim preview without overwriting
        const separator = base.length > 0 ? ' ' : '';
        const preview   = baseTextRef.current + separator + interim;
        setInterimText(interim);
        if (onResult) onResult(preview, true); // true = is interim
      }
    };

    recognition.onspeechend = () => {
      resetSilenceTimer();
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      clearSilenceTimer();
      // Fire final callback with accumulated text
      if (baseTextRef.current && onResult) {
        onResult(baseTextRef.current.trim(), false);
      }
    };

    recognition.onerror = (event) => {
      clearSilenceTimer();
      setIsListening(false);
      setInterimText('');
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else if (event.error === 'no-speech') {
        setError(null); // Silence — not an error
      } else if (event.error !== 'aborted') {
        setError(`Voice input error: ${event.error}. Please try again.`);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setError('Could not start voice input. Please try again.');
      setIsListening(false);
    }
  }, [lang, onResult, resetSilenceTimer, clearSilenceTimer]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    setIsListening(false);
    setInterimText('');
  }, [clearSilenceTimer]);

  /**
   * toggleListening — pass current input value so speech appends to it.
   * Usage: toggleListening(currentPromptValue)
   */
  const toggleListening = useCallback((existingText = '') => {
    if (isListening) {
      stopListening();
    } else {
      startListening(existingText);
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    isSupported,
    error,
    interimText,
    startListening,
    stopListening,
    toggleListening,
  };
}

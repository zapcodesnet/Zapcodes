/**
 * useSpeechToText.js
 * Reusable React hook for Web Speech API voice input.
 * Used by both GuestBuilder.jsx (landing page) and Build.jsx (main builder).
 *
 * Features:
 * - Real-time transcription as user speaks
 * - 5-second silence timeout auto-stops recording (confirmed by Vince)
 * - Graceful fallback on unsupported browsers (Firefox)
 * - Appends to existing text by default
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export function useSpeechToText({ onResult, silenceTimeoutMs = 5000, lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [interimText, setInterimText] = useState('');

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalTextRef = useRef('');

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
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
      // 5 seconds of silence — auto-stop
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    }, silenceTimeoutMs);
  }, [silenceTimeoutMs, clearSilenceTimer]);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setError(null);
    finalTextRef.current = '';
    setInterimText('');

    const recognition = new SpeechRecognition();
    recognition.continuous = false;       // Stops after pause
    recognition.interimResults = true;    // Real-time text as you speak
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      resetSilenceTimer();
    };

    recognition.onresult = (event) => {
      resetSilenceTimer(); // Reset silence timer on any speech

      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }

      if (final) {
        finalTextRef.current += final;
        setInterimText('');
        if (onResult) onResult(finalTextRef.current.trim(), false);
      } else {
        setInterimText(interim);
        if (onResult) onResult((finalTextRef.current + interim).trim(), true); // true = interim
      }
    };

    recognition.onspeechend = () => {
      // Speech ended — start silence countdown
      resetSilenceTimer();
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      clearSilenceTimer();
      if (finalTextRef.current && onResult) {
        onResult(finalTextRef.current.trim(), false);
      }
    };

    recognition.onerror = (event) => {
      clearSilenceTimer();
      setIsListening(false);
      setInterimText('');
      if (event.error === 'not-allowed') {
        setError('Microphone access was denied. You can still type your prompt.');
      } else if (event.error === 'no-speech') {
        setError(null); // Silence — not an error
      } else if (event.error !== 'aborted') {
        setError(`Voice input error: ${event.error}`);
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

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
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

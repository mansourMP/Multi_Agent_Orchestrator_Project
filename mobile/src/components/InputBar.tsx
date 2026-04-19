import React, { useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../theme/useAppTheme";

interface InputBarProps {
  onSend: (text: string) => void;
  onMediaUpload?: (formData: FormData) => void;
  onPlusPress?: () => void;
  isLoading?: boolean;
  prefilledPrompt?: string;
  placeholder?: string;
  textOnly?: boolean;
}

export const InputBar: React.FC<InputBarProps> = ({
  onSend,
  onMediaUpload,
  onPlusPress,
  isLoading,
  prefilledPrompt,
  placeholder,
  textOnly,
}) => {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles(theme, insets);
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  // Handle prefilled prompt from extensions
  React.useEffect(() => {
    if (prefilledPrompt) {
      setText(prefilledPrompt);
    }
  }, [prefilledPrompt]);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText("");
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && onMediaUpload) {
      const formData = new FormData();
      // @ts-ignore
        formData.append("image", {
          uri: result.assets[0].uri,
          name: "upload.jpg",
          type: "image/jpeg",
        });
      onMediaUpload(formData);
    }
  };

  const startRecording = async () => {
    try {
      if (isRecording || recordingRef.current || isPreparing) return;
      setIsPreparing(true);
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setIsPreparing(false);
    } catch (err) {
      console.error("Failed to start recording", err);
      setIsRecording(false);
      setIsPreparing(false);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri && onMediaUpload) {
        const formData = new FormData();
        // @ts-ignore
        formData.append("audio", {
          uri,
          name: "voice.m4a",
          type: "audio/m4a",
        });
        onMediaUpload(formData);
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        {textOnly ? null : (
          <TouchableOpacity onPress={pickImage} style={styles.iconButton}>
            <Ionicons name="attach" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.input}
          placeholder={placeholder || "Message"}
          placeholderTextColor="#9A9A9A"
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="center"
        />

        {text.trim() || isLoading ? (
          <TouchableOpacity
            onPress={handleSend} 
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            disabled={!text.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        ) : textOnly ? null : (
          <TouchableOpacity
            onPressIn={startRecording} 
            onPressOut={stopRecording}
            style={styles.iconButton}
          >
            <Ionicons
              name={isRecording ? "mic" : "mic-outline"}
              size={18}
              color={isRecording ? theme.colors.error : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const useStyles = (theme: any, insets: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: (insets.bottom > 0 ? insets.bottom : 12) + 6,
    backgroundColor: theme.colors.background,
    borderTopWidth: 0,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15.5,
    fontFamily: "DMSans_400Regular",
    minHeight: 38,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.indicator,
    opacity: 0.6,
  },
});

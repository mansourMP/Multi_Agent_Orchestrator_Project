import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../theme/useAppTheme";
import { MotionPressable } from "./system/MotionPressable";

interface InputBarProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  onMediaUpload?: (formData: FormData) => void;
  onPlusPress?: () => void;
  onPermissionPress?: () => void;
  onModelPress?: () => void;
  onRuntimePress?: () => void;
  permissionLabel?: string;
  modelLabel?: string;
  runtimeLabel?: string;
  isLoading?: boolean;
  prefilledPrompt?: string;
  placeholder?: string;
  textOnly?: boolean;
}

export const InputBar: React.FC<InputBarProps> = ({
  onSend,
  onStop,
  onMediaUpload,
  onPlusPress,
  onPermissionPress,
  onModelPress,
  onRuntimePress,
  permissionLabel,
  modelLabel,
  runtimeLabel,
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

  const handlePrimaryAccessory = () => {
    if (onPlusPress) {
      onPlusPress();
      return;
    }
    void pickImage();
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
      {textOnly ? null : (
        <View style={styles.controls}>
          {permissionLabel ? (
            <MotionPressable onPress={onPermissionPress} style={styles.controlPill} disabled={!onPermissionPress}>
              <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.textSecondary} />
              <Text numberOfLines={1} style={styles.controlText}>{permissionLabel}</Text>
            </MotionPressable>
          ) : null}
          {modelLabel ? (
            <MotionPressable onPress={onModelPress} style={styles.controlPill} disabled={!onModelPress}>
              <Ionicons name="sparkles-outline" size={14} color={theme.colors.textSecondary} />
              <Text numberOfLines={1} style={styles.controlText}>{modelLabel}</Text>
            </MotionPressable>
          ) : null}
          {runtimeLabel ? (
            <MotionPressable onPress={onRuntimePress} style={styles.controlPill} disabled={!onRuntimePress}>
              <Ionicons name="desktop-outline" size={14} color={theme.colors.textSecondary} />
              <Text numberOfLines={1} style={styles.controlText}>{runtimeLabel}</Text>
            </MotionPressable>
          ) : null}
        </View>
      )}
      <View style={styles.composer}>
        {textOnly ? null : (
          <MotionPressable onPress={handlePrimaryAccessory} style={styles.iconButton}>
            <Ionicons name="add" size={20} color={theme.colors.textSecondary} />
          </MotionPressable>
        )}

        <TextInput
          style={styles.input}
          placeholder={placeholder || "Message"}
          placeholderTextColor={theme.colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="center"
          keyboardAppearance="light"
        />

        {text.trim() || isLoading ? (
          <MotionPressable
            onPress={isLoading ? onStop : handleSend}
            style={[styles.sendButton, isLoading && styles.stopButton, !text.trim() && !isLoading && styles.sendButtonDisabled]}
            disabled={isLoading ? !onStop : !text.trim()}
          >
            {isLoading ? (
              onStop ? (
                <Ionicons name="square" size={13} color="#FFFFFF" />
              ) : (
                <ActivityIndicator size="small" color="#FFFFFF" />
              )
            ) : (
              <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
            )}
          </MotionPressable>
        ) : textOnly ? null : (
          <MotionPressable
            onPressIn={startRecording} 
            onPressOut={stopRecording}
            style={styles.iconButton}
          >
            <Ionicons
              name={isRecording ? "mic" : "mic-outline"}
              size={18}
              color={isRecording ? theme.colors.error : theme.colors.textSecondary}
            />
          </MotionPressable>
        )}
      </View>
    </View>
  );
};

const useStyles = (theme: any, insets: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: Math.max(insets.bottom, 12) + 4,
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  controlPill: {
    maxWidth: "38%",
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  controlText: {
    flexShrink: 1,
    color: theme.colors.textSecondary,
    fontSize: 11.5,
    fontFamily: "DMSans_700Bold",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#121417",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.cardHover,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    minHeight: 40,
    maxHeight: 112,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.indicator,
    opacity: 0.6,
  },
  stopButton: {
    borderRadius: 14,
    backgroundColor: theme.colors.text,
  },
});

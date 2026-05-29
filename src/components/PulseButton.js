import React, { useRef, useEffect } from 'react';
import { Animated, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

export const PulseButton = ({ onPress, style, children, disabled }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // 1. The Continuous Idle Pulse (Breathing effect)
  useEffect(() => {
    if (!disabled) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.03, duration: 1000, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
        ])
      ).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [disabled, scaleAnim]);

  const handlePressIn = () => {
    if (disabled) return;
    
    // Stop the idle pulse instantly
    scaleAnim.stopAnimation(); 
    
    // Trigger the physical tap
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Shrink the button under your finger
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    
    // Bounce back up
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 40,
      useNativeDriver: true,
    }).start(() => {
      // Once the bounce is done, restart the breathing pulse!
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.03, duration: 1000, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
        ])
      ).start();
    });
  };

  const handlePress = () => {
    if (disabled) return;
    onPress();
  };

  return (
    <TouchableOpacity 
      activeOpacity={0.9} 
      onPressIn={handlePressIn} 
      onPressOut={handlePressOut} 
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View style={[styles.button, style, { transform: [{ scale: scaleAnim }] }, disabled && styles.disabled]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#5BC5A7',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  }
});
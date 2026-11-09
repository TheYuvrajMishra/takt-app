// Takt — scaled Text / TextInput. Drop-in replacements for the
// react-native components that honour the Settings "large text" toggle
// (settings.largeText). Previously the toggle was stored but never read,
// so it did nothing; every screen now imports Text from here instead of
// react-native. Nested Text inherits the scaled size from its parent, and
// any explicit fontSize on a child scales itself. fontSize AND lineHeight
// scale together (theme/textScale), so scaled text never clips inside a
// fixed lineHeight. System font scaling (allowFontScaling) is left at its
// default on top: it stacks with the app setting, by design — both are
// the user's own choice.
import { forwardRef, type ComponentRef } from 'react';
import type { StyleProp, TextInputProps, TextProps, TextStyle } from 'react-native';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
} from 'react-native';
import { useStore } from '../store/useStore';
import { scaleTextStyle } from '../theme/textScale';

function scaledStyle(
  style: StyleProp<TextStyle>,
  largeText: boolean,
): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  return scaleTextStyle(flat, largeText);
}

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(
  function Text(props, ref) {
    const largeText = useStore((s) => s.settings.largeText);
    return (
      <RNText ref={ref} {...props} style={scaledStyle(props.style, largeText)} />
    );
  },
);
Text.displayName = 'Text';

export const TextInput = forwardRef<
  ComponentRef<typeof RNTextInput>,
  TextInputProps
>(function TextInput(props, ref) {
  const largeText = useStore((s) => s.settings.largeText);
  return (
    <RNTextInput
      ref={ref}
      {...props}
      style={scaledStyle(props.style, largeText)}
    />
  );
});
TextInput.displayName = 'TextInput';

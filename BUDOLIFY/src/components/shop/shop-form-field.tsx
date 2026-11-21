import { StyleSheet, Text, TextInput, View } from 'react-native';

type ShopFormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'number-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

export function ShopFormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  autoCapitalize,
}: ShopFormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#85877e"
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    color: '#35463a',
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 9,
    backgroundColor: '#fffefa',
    color: '#26372e',
    fontSize: 13,
    paddingHorizontal: 12,
  },
  multilineInput: {
    minHeight: 94,
    paddingTop: 12,
    paddingBottom: 12,
  },
});

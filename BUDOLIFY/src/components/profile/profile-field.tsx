import { StyleSheet, Text, TextInput, View } from 'react-native';

type ProfileFieldProps = {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url';
};

export function ProfileField({
  label,
  value,
  editable = true,
  onChangeText,
  autoCapitalize,
  keyboardType,
}: ProfileFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        placeholder={label}
        placeholderTextColor="#85877e"
        style={[styles.input, !editable && styles.readOnlyInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
    marginBottom: 13,
  },
  label: {
    color: '#35463a',
    fontSize: 10,
    fontWeight: '700',
  },
  input: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 8,
    backgroundColor: '#fffefa',
    color: '#26372e',
    fontSize: 12,
    paddingHorizontal: 11,
  },
  readOnlyInput: {
    color: '#767c70',
    backgroundColor: '#f5f5ef',
  },
});

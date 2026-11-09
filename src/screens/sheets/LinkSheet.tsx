import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Sheet, SHEET_INSET, TextField } from '../../components/ui';
import { linkSheet } from '../../navigation/sheetData';
import { useSheetData } from './useSheetData';

/** The message editor's "Add a link". */
export function LinkSheet() {
  const navigation = useNavigation();
  const data = useSheetData(linkSheet);
  const [url, setUrl] = useState('https://');
  if (!data) return null;

  const submit = () => {
    navigation.goBack();
    data.onSubmit(url.trim());
  };

  return (
    <Sheet title="Add a link">
      <View style={styles.body}>
        <TextField
          label="URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={submit}
          autoFocus
        />
        <Button title="Add link" variant="primary" fullWidth onPress={submit} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SHEET_INSET, gap: 16 },
});

describe('linkingConfig', () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_UI_GALLERY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_UI_GALLERY;
    else process.env.EXPO_PUBLIC_UI_GALLERY = ORIGINAL;
  });

  const load = () => {
    let config: typeof import('../linking').linkingConfig;
    jest.isolateModules(() => {
      config = jest.requireActual<typeof import('../linking')>('../linking').linkingConfig;
    });
    return config!;
  };

  it('has no UI gallery link in a normal build', () => {
    delete process.env.EXPO_PUBLIC_UI_GALLERY;
    expect(load()?.screens).not.toHaveProperty('UiGallery');
  });

  it('links attend://ui-gallery in a gallery build', () => {
    process.env.EXPO_PUBLIC_UI_GALLERY = '1';
    expect(load()?.screens).toHaveProperty('UiGallery', 'ui-gallery');
  });
});

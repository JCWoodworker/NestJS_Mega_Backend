import { SetMetadata } from '@nestjs/common';

export const SKIP_AUTH_KEY =
  'J9Z3i+LggL5sVFmNftCEYnN9KDF6J/iJ76Lmt4uYzUuGDd/qUw3B83mbCM28gIY5XT85OE9ekBosc0C8Qy2WTOx+jEEZ2wVuhzz2zOxgoF9iqfCVxxYJ3v4DsxuKQKCYkvKLyA+bi/Y9P4UkRfr+FiPGKVxQ5BYKm7WlkYMeR8Lu5m8qw479Syvv6p5sJcApkDPnNXupnoqdSjwwvkA8Q7LFqtqQIwQZyEFLki54h3AjjXWSYrmMw4OqVD0ruUSsL3okrCGgz0oFmkeBJqzqkg3gTKiLhtLWXT/JQOE7PVCvEG+s/lnH1kRTjMF4NtrUQRgLWbgAOQTpuIrfXcREtA';
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);

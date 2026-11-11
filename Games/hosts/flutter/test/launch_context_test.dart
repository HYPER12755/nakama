import 'package:flutter_test/flutter_test.dart';
import 'package:moongames_host/moongames_host.dart';

void main() {
  test('parses and decodes a launch query', () {
    final context = GameLaunchContext.parse('?match=abc%20123&spectate=1');
    expect(context, isNotNull);
    expect(context!.query, 'match=abc%20123&spectate=1');
    expect(context.params, {'match': 'abc 123', 'spectate': '1'});
    expect(context.toJson(), {
      'query': 'match=abc%20123&spectate=1',
      'params': {'match': 'abc 123', 'spectate': '1'},
    });
  });

  test('strips a hash prefix and rejects unusable queries', () {
    expect(GameLaunchContext.parse('#match=abc')?.params, {'match': 'abc'});
    expect(GameLaunchContext.parse(null), isNull);
    expect(GameLaunchContext.parse(''), isNull);
    expect(GameLaunchContext.parse('?'), isNull);
    expect(GameLaunchContext.parse('x' * 4097), isNull);
  });
}

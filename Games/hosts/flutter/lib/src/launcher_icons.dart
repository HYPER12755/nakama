import 'dart:math' as math;

import 'package:flutter/material.dart';

enum MoonGamesLauncherIcon {
  arrowLeft,
  arrowRight,
  board,
  cards,
  carrom,
  check,
  chess,
  close,
  ludo,
  offline,
  refresh,
  search,
  shield,
  spark,
  users,
  wifi,
}

/// Vector controls for the launcher. No platform font glyphs are used here.
class MoonGamesLauncherIconWidget extends StatelessWidget {
  const MoonGamesLauncherIconWidget(
    this.icon, {
    super.key,
    this.size = 20,
    this.color = Colors.white,
    this.strokeWidth = 1.8,
  });

  final MoonGamesLauncherIcon icon;
  final double size;
  final Color color;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _LauncherIconPainter(
          icon: icon,
          color: color,
          strokeWidth: strokeWidth,
        ),
      ),
    );
  }
}

class _LauncherIconPainter extends CustomPainter {
  const _LauncherIconPainter({
    required this.icon,
    required this.color,
    required this.strokeWidth,
  });

  final MoonGamesLauncherIcon icon;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 24, size.height / 24);
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    switch (icon) {
      case MoonGamesLauncherIcon.search:
        canvas.drawCircle(const Offset(10.8, 10.8), 6.2, stroke);
        canvas.drawLine(const Offset(15.4, 15.4), const Offset(20, 20), stroke);
      case MoonGamesLauncherIcon.shield:
        canvas.drawPath(
          Path()
            ..moveTo(12, 2.8)
            ..lineTo(19, 5.8)
            ..lineTo(19, 10.9)
            ..cubicTo(19, 15.3, 16.1, 18.7, 12, 20.2)
            ..cubicTo(7.9, 18.7, 5, 15.3, 5, 10.9)
            ..lineTo(5, 5.8)
            ..close(),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(8.7, 11.8)
            ..lineTo(10.8, 13.9)
            ..lineTo(15.3, 9.2),
          stroke,
        );
      case MoonGamesLauncherIcon.arrowRight:
        canvas.drawLine(const Offset(4.5, 12), const Offset(18.5, 12), stroke);
        canvas.drawPath(
          Path()
            ..moveTo(13, 6.5)
            ..lineTo(18.5, 12)
            ..lineTo(13, 17.5),
          stroke,
        );
      case MoonGamesLauncherIcon.arrowLeft:
        canvas.drawLine(const Offset(19.5, 12), const Offset(5.5, 12), stroke);
        canvas.drawPath(
          Path()
            ..moveTo(11, 6.5)
            ..lineTo(5.5, 12)
            ..lineTo(11, 17.5),
          stroke,
        );
      case MoonGamesLauncherIcon.refresh:
        canvas.drawArc(
          Rect.fromCircle(const Offset(12, 12), 8),
          -0.4,
          math.pi * 1.62,
          false,
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(20, 4.7)
            ..lineTo(20, 10.4)
            ..lineTo(14.3, 10.4),
          stroke,
        );
      case MoonGamesLauncherIcon.spark:
        canvas.drawPath(
          Path()
            ..moveTo(12, 2.8)
            ..lineTo(13.8, 8.2)
            ..lineTo(19.2, 10)
            ..lineTo(13.8, 11.8)
            ..lineTo(12, 17.2)
            ..lineTo(10.2, 11.8)
            ..lineTo(4.8, 10)
            ..lineTo(10.2, 8.2)
            ..close(),
          stroke,
        );
      case MoonGamesLauncherIcon.users:
        canvas.drawCircle(const Offset(9, 8.7), 3.2, stroke);
        canvas.drawPath(
          Path()
            ..moveTo(3.6, 20)
            ..cubicTo(4.2, 16.6, 6.3, 14.6, 9, 14.6)
            ..cubicTo(11.7, 14.6, 13.8, 16.6, 14.4, 20),
          stroke,
        );
        canvas.drawArc(
          Rect.fromCircle(const Offset(15.3, 9.9), 3.2),
          -1.1,
          2.2,
          false,
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(16.7, 14.9)
            ..cubicTo(18.9, 15.4, 20.2, 17.2, 20.7, 20),
          stroke,
        );
      case MoonGamesLauncherIcon.wifi:
        canvas.drawPath(
          Path()
            ..moveTo(3.5, 9.2)
            ..quadraticBezierTo(12, 3.5, 20.5, 9.2),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(6.4, 12.4)
            ..quadraticBezierTo(12, 8.5, 17.6, 12.4),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(9.4, 15.7)
            ..quadraticBezierTo(12, 13.8, 14.6, 15.7),
          stroke,
        );
        canvas.drawCircle(const Offset(12, 19), 0.9, fill);
      case MoonGamesLauncherIcon.offline:
        canvas.drawPath(
          Path()
            ..moveTo(4.2, 10)
            ..quadraticBezierTo(8.8, 6.9, 9.2, 7.3),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(14.8, 7.3)
            ..quadraticBezierTo(17.4, 8.1, 19.8, 9.9),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(6.8, 13)
            ..quadraticBezierTo(8.0, 12.2, 10, 11.7),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(14, 11.7)
            ..quadraticBezierTo(15.6, 12.1, 17.2, 13),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(9.6, 16)
            ..quadraticBezierTo(12, 14.7, 14.4, 16),
          stroke,
        );
        canvas.drawCircle(const Offset(12, 19), 0.9, fill);
        canvas.drawLine(const Offset(4, 4), const Offset(20, 20), stroke);
      case MoonGamesLauncherIcon.close:
        canvas.drawLine(
          const Offset(5.5, 5.5),
          const Offset(18.5, 18.5),
          stroke,
        );
        canvas.drawLine(
          const Offset(18.5, 5.5),
          const Offset(5.5, 18.5),
          stroke,
        );
      case MoonGamesLauncherIcon.check:
        canvas.drawPath(
          Path()
            ..moveTo(4.5, 12.5)
            ..lineTo(9, 17)
            ..lineTo(19.5, 6.5),
          stroke,
        );
      case MoonGamesLauncherIcon.chess:
        canvas.drawLine(const Offset(7.8, 20), const Offset(16.2, 20), stroke);
        canvas.drawPath(
          Path()
            ..moveTo(9, 17)
            ..lineTo(15, 17)
            ..lineTo(14, 12.2)
            ..lineTo(10, 12.2)
            ..close(),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(11.6, 12.2)
            ..lineTo(13.7, 9.3)
            ..lineTo(11.9, 8.1)
            ..lineTo(9.1, 11.6),
          stroke,
        );
        canvas.drawCircle(const Offset(12.7, 6.6), 1.1, stroke);
      case MoonGamesLauncherIcon.cards:
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            const Rect.fromLTWH(4, 7, 9.5, 13),
            const Radius.circular(2),
          ),
          stroke,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            const Rect.fromLTWH(10.5, 4, 9.5, 13),
            const Radius.circular(2),
          ),
          stroke,
        );
        canvas.drawPath(
          Path()
            ..moveTo(15.2, 8.3)
            ..lineTo(16.5, 9.6)
            ..lineTo(14, 12.2),
          stroke,
        );
      case MoonGamesLauncherIcon.ludo:
        for (final center in const [
          Offset(7, 7),
          Offset(17, 7),
          Offset(7, 17),
          Offset(17, 17),
        ]) {
          canvas.drawCircle(center, 2.8, stroke);
        }
        canvas.drawRect(const Rect.fromLTWH(10.2, 10.2, 3.6, 3.6), stroke);
      case MoonGamesLauncherIcon.carrom:
        canvas.drawCircle(const Offset(12, 12), 8, stroke);
        canvas.drawCircle(const Offset(12, 12), 3, stroke);
        canvas.drawLine(const Offset(12, 4), const Offset(12, 7.3), stroke);
        canvas.drawLine(const Offset(12, 16.7), const Offset(12, 20), stroke);
        canvas.drawLine(const Offset(4, 12), const Offset(7.3, 12), stroke);
        canvas.drawLine(const Offset(16.7, 12), const Offset(20, 12), stroke);
      case MoonGamesLauncherIcon.board:
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            const Rect.fromLTWH(4, 4, 16, 16),
            const Radius.circular(2),
          ),
          stroke,
        );
        canvas.drawLine(const Offset(12, 4), const Offset(12, 20), stroke);
        canvas.drawLine(const Offset(4, 12), const Offset(20, 12), stroke);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LauncherIconPainter oldDelegate) {
    return oldDelegate.icon != icon ||
        oldDelegate.color != color ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

MoonGamesLauncherIcon launcherGameIcon(String icon) {
  return switch (icon) {
    'chess' => MoonGamesLauncherIcon.chess,
    'cards' => MoonGamesLauncherIcon.cards,
    'ludo' => MoonGamesLauncherIcon.ludo,
    'carrom' => MoonGamesLauncherIcon.carrom,
    _ => MoonGamesLauncherIcon.board,
  };
}
